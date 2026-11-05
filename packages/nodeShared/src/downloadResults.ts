import { zipSync } from "fflate";
import type { WorkspaceFiles } from "@toonflow/nodes-scaffold/workspaceFiles";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/values";

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_").trim() || "生成结果";
const extensionOf = (item: NodeMediaValue) => item.url.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0].toLowerCase() ?? "";

// 通过带 download 的链接保存：桌面端由宿主拦截后弹出保存位置，浏览器直接下载。
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadResult(files: WorkspaceFiles, item: NodeMediaValue, name: string) {
  saveBlob(new Blob([await files.read(item.url)], { type: item.mimeType }), `${safeName(name)}${extensionOf(item)}`);
}

// 批量结果按序号命名打成一个 zip；媒体本身已压缩，只打包不再压缩。
export async function downloadResults(files: WorkspaceFiles, items: NodeMediaValue[], name: string) {
  const base = safeName(name);
  const entries = await Promise.all(items.map(async (item, index) => [`${base}-${index + 1}${extensionOf(item)}`, new Uint8Array(await files.read(item.url))] as const));
  saveBlob(new Blob([zipSync(Object.fromEntries(entries), { level: 0 })], { type: "application/zip" }), `${base}-${items.length}张.zip`);
}
