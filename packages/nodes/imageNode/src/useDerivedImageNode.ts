import { inject } from "vue";
import { useNode, useVueFlow } from "@vue-flow/core";
import { uploadNodeFile, useNodeFiles } from "@toonflow/nodes-scaffold/runtime";

// 由当前图片派生新图片节点（裁剪、放大等）：上传到新节点目录，放在右侧空位并连线；提交前失败会清理已上传文件。
export function useDerivedImageNode() {
  const { node } = useNode();
  const { addNodes, addEdges, findNode, getNodes, nodeTypes } = useVueFlow();
  const files = useNodeFiles();
  const batchHistory = inject<(action: () => Promise<void>) => Promise<void>>("batchCanvasHistory", action => action());

  return async function createDerived(blob: Blob, input: { label: string; width: number; height: number }, signal?: AbortSignal) {
    if (!nodeTypes?.value?.["remote-imageNode"]) throw new Error("请先启用图片节点插件");
    const workspace = files.getWorkspaceFiles();
    const id = crypto.randomUUID();
    let committed = false;
    try {
      const path = await uploadNodeFile(workspace, id, new File([blob], "image.png", { type: blob.type || "image/png" }));
      signal?.throwIfAborted();
      if (findNode(node.id) !== node || !nodeTypes?.value?.["remote-imageNode"]) throw new Error("画布节点已变化，请重新操作");
      // 图片节点按 240 高显示，宽度随比例变化。
      const width = 240 * input.width / input.height + 18;
      const height = 300;
      const x = node.computedPosition.x + node.dimensions.width + 80;
      let y = node.computedPosition.y;
      for (const other of [...getNodes.value].sort((left, right) => left.computedPosition.y - right.computedPosition.y)) {
        const position = other.computedPosition;
        if (position.x < x + width && position.x + other.dimensions.width > x && position.y < y + height && position.y + other.dimensions.height > y) {
          y = position.y + other.dimensions.height + 40;
        }
      }
      await batchHistory(async () => {
        signal?.throwIfAborted();
        addNodes([{ id, type: "remote-imageNode", position: { x, y }, data: { label: `${node.data.label || "图片"} · ${input.label}`, outputs: { image: { dataType: "IMAGE", value: { url: path, mimeType: blob.type || "image/png" } } } } }]);
        addEdges([{ id: crypto.randomUUID(), source: node.id, sourceHandle: "image", target: id, targetHandle: "in" }]);
        committed = true;
      });
      return id;
    } finally {
      if (!committed) await workspace.remove(`assets/${id}`, true).catch(() => {});
    }
  };
}

export function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("图片编码失败")), "image/png"));
}

export async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}
