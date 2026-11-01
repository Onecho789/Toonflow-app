import axios from "axios";
import useWorkspaceFiles from "@/lib/workspaceFiles";

const isConflict = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 409;

// 把工作台文件夹里的结果复制一份到全局素材库的 folder 下，同名时自动编号；返回素材库内路径。
export default async function saveToAssets(directory: string, path: string, folder: string) {
  const content = await useWorkspaceFiles(directory).read(path);
  await axios.post("/api/assets/mkdir", { path: folder }).catch(error => { if (!isConflict(error)) throw error; });
  const name = path.split("/").at(-1)!;
  const dot = name.lastIndexOf(".");
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  // ACT: 最多尝试 100 个编号，超过直接报错，避免无限重试。
  for (let index = 0; index < 100; index++) {
    const target = `${folder}/${index ? `${stem}(${index})` : stem}${extension}`;
    try {
      await axios.put("/api/assets/save", content, { params: { path: target }, headers: { "Content-Type": "application/octet-stream" } });
      return target;
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  throw new Error("素材库中同名文件过多，请先整理后重试");
}
