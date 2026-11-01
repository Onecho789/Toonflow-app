import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";

export type WorkbenchType = "image" | "video";

// 生图、视频工作台各自记住一个文件夹，结果流读写这个文件夹，与画布项目互不影响。
export const useWorkbenchStore = defineStore("workbench", () => {
  const directories = ref<Record<WorkbenchType, string>>({ image: "", video: "" });

  async function setDirectory(type: WorkbenchType, path: string) {
    const { data } = await axios.get<{ code: number; data?: { directory: string }; message?: string }>("/api/workspaces/check", {
      params: { directory: path }, headers: { "x-toonflow-workspace": "1" },
    });
    if (data.code !== 200 || !data.data?.directory) throw new Error(data.message || "工作目录校验失败");
    directories.value[type] = data.data.directory;
    return data.data.directory;
  }

  function clearDirectory(type: WorkbenchType) {
    directories.value[type] = "";
  }

  return { directories, setDirectory, clearDirectory };
}, {
  persist: { key: "toonflow.workbench", pick: ["directories"] },
});
