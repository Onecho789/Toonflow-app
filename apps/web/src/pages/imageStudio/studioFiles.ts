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
