import { zipSync } from "fflate";
import type { WorkspaceFiles } from "@toonflow/nodes-scaffold/workspaceFiles";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/values";

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_").trim() || "生成结果";
const extensionOf = (item: NodeMediaValue) => item.url.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0].toLowerCase() ?? "";

// 通过带 download 的链接保存：桌面端由宿主拦截后弹出保存位置，浏览器直接下载。
async function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  let intercepted = false;
  let finish: (() => void) | undefined;
  const handleDownloadState = (event: Event) => {
    const downloading = (event as CustomEvent<boolean>).detail;
    if (downloading === true) intercepted = true;
    else if (downloading === false && intercepted) finish?.();
  };
  try {
    link.addEventListener("downloadstate", handleDownloadState);
    document.body.append(link);
    await new Promise<void>(resolve => {
      finish = resolve;
      link.click();
      // 宿主同步通知接管下载，直到保存、取消或失败才结束等待。
      if (!intercepted) resolve();
    });
  } finally {
    link.removeEventListener("downloadstate", handleDownloadState);
    link.remove();
    if (intercepted) URL.revokeObjectURL(url);
    else setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

export async function downloadResult(files: WorkspaceFiles, item: NodeMediaValue, name: string) {
  await saveBlob(new Blob([await files.read(item.url)], { type: item.mimeType }), `${safeName(name)}${extensionOf(item)}`);
}

// 批量结果按序号命名打成一个 zip；媒体本身已压缩，只打包不再压缩。
export async function downloadResults(files: WorkspaceFiles, items: NodeMediaValue[], name: string) {
  const base = safeName(name);
  const entries = await Promise.all(items.map(async (item, index) => [`${base}-${index + 1}${extensionOf(item)}`, new Uint8Array(await files.read(item.url))] as const));
  await saveBlob(new Blob([zipSync(Object.fromEntries(entries), { level: 0 })], { type: "application/zip" }), `${base}-${items.length}张.zip`);
}
