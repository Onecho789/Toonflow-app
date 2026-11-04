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
  const { addNodes, addEdges, removeNodes, findNode, getNodes, nodeTypes } = useVueFlow();
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

  return { split, available };
}
