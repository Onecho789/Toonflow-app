import type { NodeLabelData } from "@toonflow/nodes-scaffold/nodeLabel";

const sentenceBreak = /[。．.，,；;？?！!…\r\n]+/;
const maxLength = 16;

// 取提示词第一句作节点名：去掉标点、符号和多余空白，最多 16 个字符；没有可用文字时返回空串。
export function promptLabel(prompt: string) {
  for (const sentence of prompt.split(sentenceBreak)) {
    const text = sentence.replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
    if (text) return Array.from(text).slice(0, maxLength).join("").trim();
  }
  return "";
}

// 生成时自动命名：仅在名称为空或仍是默认名、且没有手动命名过时生效。
export function applyPromptLabel(data: NodeLabelData, prompt: string, defaultLabel: string) {
  if (data.labelLocked || (data.label && data.label !== defaultLabel)) return;
  const label = promptLabel(prompt);
  if (label) data.label = label;
}

// 右键「按提示词重命名」：视为手动命名，之后生成不再自动改名。
export function renameByPrompt(data: NodeLabelData, prompt: string) {
  const label = promptLabel(prompt);
  if (!label) return false;
  data.label = label;
  data.labelLocked = true;
  return true;
}
