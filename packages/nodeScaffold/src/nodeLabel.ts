// 节点名称相关的通用字段：labelLocked 表示名称由用户或 Agent 手动指定，自动命名不再覆盖。
export type NodeLabelData = { label?: string; labelLocked?: boolean };

const copySuffix = /\s*-\s*副本(?:\s*\d+)?$/;
const indexSuffix = /\s+\d+$/;

// 副本命名为「名称 2」「名称 3」：先去掉旧的「 - 副本」和一个「 N」序号得到基名，再取画布上最小未用的序号。
// labels 为画布现有名称，结果会写回其中，批量复制时连续调用不会重名。
export function copyLabel(label: string, labels: Set<string>) {
  let base = label.trim();
  while (copySuffix.test(base)) base = base.replace(copySuffix, "");
  base = base.replace(indexSuffix, "").trim() || label.trim() || "未命名节点";
  let index = 2;
  while (labels.has(`${base} ${index}`)) index++;
  const result = `${base} ${index}`;
  labels.add(result);
  return result;
}
