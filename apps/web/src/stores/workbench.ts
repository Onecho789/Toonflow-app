import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";

export type WorkbenchType = "image" | "video";
export type WorkbenchFolder = { directory: string; usedAt: number };

// ACT: 每个工作台最多记 20 个用过的文件夹，超出丢弃最久未用的；只是列表，不影响磁盘文件。
const folderLimit = 20;

// 生图、视频工作台各自记住当前文件夹和用过的文件夹，结果流读写当前文件夹，与画布项目互不影响。
export const useWorkbenchStore = defineStore("workbench", () => {
  const directories = ref<Record<WorkbenchType, string>>({ image: "", video: "" });
  const folders = ref<Record<WorkbenchType, WorkbenchFolder[]>>({ image: [], video: [] });

  async function setDirectory(type: WorkbenchType, path: string) {
    const { data } = await axios.get<{ code: number; data?: { directory: string }; message?: string }>("/api/workspaces/check", {
      params: { directory: path }, headers: { "x-toonflow-workspace": "1" },
    });
    if (data.code !== 200 || !data.data?.directory) throw new Error(data.message || "工作目录校验失败");
    const directory = data.data.directory;
    directories.value[type] = directory;
    folders.value[type] = [{ directory, usedAt: Date.now() }, ...folders.value[type].filter(item => item.directory !== directory && item.directory !== path)].slice(0, folderLimit);
    return directory;
  }

  // 从列表移除；移除的是当前文件夹时回到选择文件夹的引导页。
  function removeFolder(type: WorkbenchType, directory: string) {
    folders.value[type] = folders.value[type].filter(item => item.directory !== directory);
    if (directories.value[type] === directory) directories.value[type] = "";
  }

  return { directories, folders, setDirectory, removeFolder };
}, {
  persist: { key: "toonflow.workbench", pick: ["directories", "folders"] },
});
