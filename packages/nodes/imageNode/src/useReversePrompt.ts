import { inject, nextTick } from "vue";
import { useNode, useVueFlow } from "@vue-flow/core";

// 与 infinite-canvas 的反推提示词预设一致：新建文本节点并连上当前图片，用户选模型后点生成即可。
const reversePrompt = "请根据参考图片反推一段适合用于 AI 生图的提示词。\n\n要求：\n1. 只输出提示词正文，不要解释。\n2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。\n3. 尽量写成可直接用于生图模型的完整提示词。";

export function useReversePrompt() {
  const { id, node } = useNode();
  const { addNodes, addEdges, removeNodes, findNode, getNodes, nodeTypes, addSelectedNodes, removeSelectedNodes, getSelectedNodes } = useVueFlow();
  const batchHistory = inject<(action: () => Promise<void>) => Promise<void>>("batchCanvasHistory", action => action());

  return async function createReversePrompt() {
    const type = "remote-textNode";
    if (!nodeTypes?.value?.[type]) throw new Error("请先启用文本节点插件");
    if (findNode(id) !== node) throw new Error("原节点已变化，请重新操作");
    const nodeId = crypto.randomUUID();
    const width = 320;
    const height = 260;
    // 放在图片下方，与 infinite-canvas 一致；被占用时继续向下找空位。
    const x = node.computedPosition.x;
    let y = node.computedPosition.y + (node.dimensions.height || 300) + 60;
    for (const other of [...getNodes.value].sort((left, right) => left.computedPosition.y - right.computedPosition.y)) {
      const position = other.computedPosition;
      if (position.x < x + width && position.x + (other.dimensions.width || 320) > x && position.y < y + height && position.y + (other.dimensions.height || 300) > y) {
        y = position.y + (other.dimensions.height || 300) + 40;
      }
    }
    await batchHistory(async () => {
      try {
        addNodes({ id: nodeId, type, position: { x, y }, data: { label: `${node.data.label || "图片"} · 反推提示词`, prompt: reversePrompt, promptModel: reversePrompt.split("\n").map(text => [{ type: "Write", text }]) } });
        addEdges({ id: crypto.randomUUID(), source: id, sourceHandle: "image", target: nodeId, targetHandle: "in" });
      } catch (error) {
        removeNodes(nodeId, true, false);
        throw error;
      }
      await nextTick();
    });
    // 选中新节点，直接露出提示词面板。
    const created = findNode(nodeId);
    if (created) {
      removeSelectedNodes(getSelectedNodes.value);
      addSelectedNodes([created]);
    }
    return nodeId;
  };
}
