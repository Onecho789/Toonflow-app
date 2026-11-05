import axios from "axios";
import { reactive } from "vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";

// 自定义封面固定存放在项目 assets 下，随项目文件夹复制、导出；画布列表本就忽略 assets。
export const projectCoverPath = "assets/projectCover.webp";
const maxSide = 1280;
// 封面变更后递增，projectCover 据此重新读取。
const revisions = reactive(new Map<string, number>());

export function coverRevision(directory: string) {
  return revisions.get(directory) ?? 0;
}

function bump(directory: string) {
  revisions.set(directory, coverRevision(directory) + 1);
}

// 用 img 解码以兼容 SVG；长边缩到 1280 再编码为 WebP，避免大图拖慢项目列表。
async function encodeCover(image: Blob) {
  const url = URL.createObjectURL(image);
  try {
    const element = new Image();
    element.src = url;
    await element.decode().catch(() => { throw new Error("无法读取这张图片，请换一张"); });
    const { naturalWidth: width, naturalHeight: height } = element;
    if (!width || !height) throw new Error("无法读取这张图片，请换一张");
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境无法处理图片");
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("图片编码失败")), "image/webp", 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function setProjectCover(directory: string, image: Blob) {
  const files = useWorkspaceFiles(directory);
  const cover = await encodeCover(image);
  await files.mkdir("assets").catch(error => { if (!axios.isAxiosError(error) || error.response?.status !== 409) throw error; });
  await files.write(projectCoverPath, cover);
  bump(directory);
}

export async function clearProjectCover(directory: string) {
  await useWorkspaceFiles(directory).remove(projectCoverPath).catch(error => { if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error; });
  bump(directory);
}
