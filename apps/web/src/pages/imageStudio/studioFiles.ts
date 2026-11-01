import { ref, watch } from "vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";

const imageTypes: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp", tiff: "image/tiff",
};
const mediaTypes: Record<string, string> = {
  ...imageTypes, mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4", opus: "audio/opus",
};

export type MediaKind = "image" | "video" | "audio";

// 按扩展名识别图片，非图片返回 undefined。
export function imageMimeType(path: string) {
  return imageTypes[path.split(".").at(-1)?.toLowerCase() ?? ""];
}

export function imageExtension(mimeType: string) {
  return Object.keys(imageTypes).find(extension => imageTypes[extension] === mimeType);
}

// 按扩展名识别图片、视频、音频，其余返回 undefined。
export function mediaMimeType(path: string) {
  return mediaTypes[path.split(".").at(-1)?.toLowerCase() ?? ""];
}

export function mediaExtension(mimeType: string) {
  return Object.keys(mediaTypes).find(extension => mediaTypes[extension] === mimeType);
}

export function mediaKind(mimeType: string) {
  const kind = mimeType.split("/")[0];
  return kind === "image" || kind === "video" || kind === "audio" ? kind as MediaKind : undefined;
}

// 本地时间加随机后缀，例如 20261101-153012-a1b2c3；定长前缀按名称倒序即新的在前。
export function timestampName() {
  const time = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${time.getFullYear()}${pad(time.getMonth() + 1)}${pad(time.getDate())}-${pad(time.getHours())}${pad(time.getMinutes())}${pad(time.getSeconds())}-${crypto.randomUUID().slice(0, 6)}`;
}

// 把提示词库的参考图并发下载到工作台 references，保持原顺序，同一地址复用已下载的文件；失败的跳过并计数，由调用方提示。
// ACT: 服务端下载不走系统代理，境外图源（GitHub、X 等）常连不上；失败后改由浏览器经系统代理下载再写入，
// 仍要求图源允许跨域读取。文件名与服务端一致用地址的 SHA-256，已存在即复用。
export async function importReferenceImages(directory: string, urls: string[]) {
  const files = useWorkspaceFiles(directory);
  const browserImport = async (url: string) => {
    const response = await fetch(url, { referrerPolicy: "no-referrer", signal: AbortSignal.timeout(30000) });
    const blob = await response.blob();
    const extension = imageExtension(blob.type);
    if (!response.ok || !extension || !blob.size || blob.size > 20 * 1024 * 1024) throw new Error("参考图下载失败");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(new URL(url).href)))].map(item => item.toString(16).padStart(2, "0")).join("");
    const path = `references/${hash}.${extension}`;
    await files.mkdir("references").catch(() => undefined);
    await files.write(path, blob, true).catch(async error => { if ((await files.list("references")).entries.every(item => item.path !== path)) throw error; });
    return { path, mimeType: blob.type };
  };
  const results = await Promise.allSettled(urls.map(url => files.importImage(url, "references").catch(() => browserImport(url))));
  const images = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  return { images, failed: results.length - images.length };
}

// 读取工作台文件夹里的图片并返回 blob URL，路径为空时不读取，路径变化或卸载时释放。
export function useImageUrl(directory: () => string, path: () => string) {
  const url = ref("");
  const failed = ref(false);
  watch([directory, path], ([currentDirectory, currentPath], _previous, onCleanup) => {
    url.value = "";
    failed.value = false;
    if (!currentPath) return;
    const handle = useWorkspaceFiles(currentDirectory).acquireUrl(currentPath, imageMimeType(currentPath));
    let active = true;
    handle.url.then(value => { if (active) url.value = value; }, () => { if (active) failed.value = true; });
    onCleanup(() => {
      active = false;
      handle.release();
    });
  }, { immediate: true });
  return { url, failed };
}
