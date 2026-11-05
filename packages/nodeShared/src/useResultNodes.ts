import { inject, nextTick } from "vue";
import { useNode, useVueFlow } from "@vue-flow/core";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/values";

const nodeKinds = {
  image: { type: "remote-imageNode", output: "image", dataType: "IMAGE", label: "图片", plugin: "图片节点" },
  video: { type: "remote-videoNode", output: "video", dataType: "VIDEO", label: "视频", plugin: "视频节点" },
} as const;

// 把生成结果拆成独立的图片或视频节点，放在当前节点右侧依次向下排列。
export function useResultNodes(mediaType: "image" | "video") {
  const { id, node } = useNode();
  const { addNodes, addEdges, removeNodes, findNode, getNodes, edges, nodeTypes, removeSelectedElements, addSelectedNodes } = useVueFlow();
  const batchHistory = inject<(action: () => Promise<void>) => Promise<void>>("batchCanvasHistory", action => action());
  const kind = nodeKinds[mediaType];

  const available = () => !!nodeTypes?.value?.[kind.type];

  async function split(items: NodeMediaValue[]) {
    if (!items.length) return [];
    if (!available()) throw new Error(`请先启用${kind.plugin}插件`);
    if (findNode(id) !== node) throw new Error("原节点已变化，请重新操作");
    const width = 320;
    const height = 300;
    const x = node.computedPosition.x + (node.dimensions.width || width) + 80;
    let y = node.computedPosition.y;
    const occupied = [...getNodes.value].sort((left, right) => left.computedPosition.y - right.computedPosition.y);
    const positions = items.map(() => {
      for (const other of occupied) {
        const position = other.computedPosition;
        if (position.x < x + width && position.x + (other.dimensions.width || width) > x && position.y < y + height && position.y + (other.dimensions.height || height) > y) {
          y = position.y + (other.dimensions.height || height) + 40;
        }
      }
      const position = { x, y };
      y += height + 40;
      return position;
    });
    const ids = items.map(() => crypto.randomUUID());
    await batchHistory(async () => {
      try {
        addNodes(items.map((value, index) => ({
          id: ids[index]!, type: kind.type, position: positions[index]!,
          data: { label: `${node.data.label || kind.label} · ${kind.label}${items.length > 1 ? ` ${index + 1}` : ""}`, outputs: { [kind.output]: { dataType: kind.dataType, value } } },
        })));
        // ACT: 视频节点没有输入端口，不创建虚假数据连线；图片节点接到原节点的图片输出。
        if (mediaType === "image") addEdges(ids.map(target => ({ id: crypto.randomUUID(), source: id, sourceHandle: kind.output, target, targetHandle: "in" })));
      } catch (error) {
        removeNodes(ids, true, false);
        throw error;
      }
      await nextTick();
    });
    return ids;
  }

  // 参照 infinite-canvas 的「创建副本」：复制当前生成节点的提示词、模型和设置，连上相同的参考输入，输出换成选中的那张结果。
  // 放在节点下方（右侧是批量结果展开区），创建后选中副本，让它抬到最上层。
  async function duplicate(value: NodeMediaValue) {
    if (findNode(id) !== node) throw new Error("原节点已变化，请重新操作");
    const data = JSON.parse(JSON.stringify(node.data)) as Record<string, unknown>;
    // ACT: 只带走生成参数和这一张结果，批量列表、进行中的任务和状态不复制；素材文件仍引用原节点目录，与拆为节点一致。
    delete data.results;
    delete data.generationTask;
    delete data.generationStatus;
    const width = node.dimensions.width || 320;
    const height = node.dimensions.height || 300;
    const position = { x: node.position.x, y: node.position.y + height + 32 };
    const column = getNodes.value.filter(other => other.id !== id && other.parentNode === node.parentNode && other.position.x < position.x + width && other.position.x + (other.dimensions.width || width) > position.x).sort((left, right) => left.position.y - right.position.y);
    for (const other of column) {
      if (position.y < other.position.y + (other.dimensions.height || height) + 32 && position.y + height + 32 > other.position.y) position.y = other.position.y + (other.dimensions.height || height) + 32;
    }
    const copyId = crypto.randomUUID();
    const incoming = edges.value.filter(edge => edge.target === id);
    await batchHistory(async () => {
      try {
        addNodes({
          id: copyId, type: node.type, zIndex: node.zIndex, parentNode: node.parentNode, position,
          data: { ...data, label: `${node.data.label || kind.label} - 副本`, outputs: { ...(data.outputs as object), [kind.output]: { dataType: kind.dataType, value } } },
        });
        addEdges(incoming.map(edge => ({ id: crypto.randomUUID(), source: edge.source, sourceHandle: edge.sourceHandle, target: copyId, targetHandle: edge.targetHandle })));
      } catch (error) {
        removeNodes([copyId], true, false);
        throw error;
      }
      await nextTick();
    });
    // ACT: 画布开启了 elevateNodesOnSelect，选中副本即可让它压在原节点和展开的结果卡之上。
    const created = findNode(copyId);
    if (created) {
      removeSelectedElements();
      addSelectedNodes([created]);
    }
    return copyId;
  }

  return { split, duplicate, available };
}
