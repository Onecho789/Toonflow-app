import { isNodeOutput, type NodeMediaValue } from "@toonflow/nodes-scaffold/values";

/** 仅保留真实媒体输出；封面选择不扫描磁盘，也不读取节点的提示词或引用图。 */
export function canvasCoverCandidates(nodes: unknown): NodeMediaValue[] {
  if (!Array.isArray(nodes)) return [];
  const candidates: { value: NodeMediaValue; state: number; order: number }[] = [];
  let order = 0;
  const compare = (left: typeof candidates[number], right: typeof candidates[number]) => left.state - right.state
    || Number(left.value.mimeType.startsWith("video/")) - Number(right.value.mimeType.startsWith("video/"))
    || (right.value.createdAt ?? 0) - (left.value.createdAt ?? 0) || left.order - right.order;
  const add = (output: unknown, state: number) => {
    if (!isNodeOutput(output) || (output.dataType !== "IMAGE" && output.dataType !== "VIDEO")) return;
    const path = output.value.url.trim().replaceAll("\\", "/");
    // 工作区媒体使用相对路径；不把导入数据中的网络地址、绝对路径或上级目录作为封面读取。
    if (path.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(path) || path.split("/").includes("..")) return;
    const url = path.split("/").filter(part => part && part !== ".").join("/");
    if (!url) return;
    const createdAt = typeof output.value.createdAt === "number" && Number.isFinite(output.value.createdAt) && output.value.createdAt > 0 ? output.value.createdAt : undefined;
    const candidate = { value: { url, mimeType: output.value.mimeType, createdAt }, state, order: order++ };
    const index = candidates.findIndex(item => item.value.url === url);
    if (index >= 0) {
      if (compare(candidate, candidates[index]!) >= 0) return;
      candidates.splice(index, 1);
    }
    candidates.push(candidate);
    candidates.sort(compare);
    if (candidates.length > 4) candidates.pop();
  };
  // ACT: 首轮最多检查 1000 个节点、每节点 12 个输出及批量结果，最终只加载最多 4 个候选。
  for (const node of nodes.slice(0, 1000)) {
    if (!node || typeof node !== "object" || !node.data || typeof node.data !== "object") continue;
    const data = node.data as Record<string, unknown>;
    const task = data.generationTask && typeof data.generationTask === "object" ? data.generationTask as Record<string, unknown> : undefined;
    const state = data.generationStatus === "succeeded" ? 0 : data.generationStatus === "running" || data.generationStatus === "failed" || task?.taskId ? 2 : 1;
    if (data.outputs && typeof data.outputs === "object" && !Array.isArray(data.outputs)) {
      for (const output of Object.values(data.outputs).slice(0, 12)) add(output, state);
    }
    if (Array.isArray(data.results)) {
      for (const value of data.results.slice(0, 12)) {
        if (!value || typeof value !== "object") continue;
        add({ dataType: typeof value.mimeType === "string" && value.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE", value }, state);
      }
    }
  }
  return candidates.map(candidate => candidate.value);
}
