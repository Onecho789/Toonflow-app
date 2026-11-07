import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import type { AgentAttachment } from "@/components/agent/types";

export type Project = {
  directory: string;
  name: string;
  lastOpenedAt: number;
  /** 最近打开的画布路径，最新在前。 */
  recentCanvases?: string[];
  /** 用户标记的常用画布路径。 */
  pinnedCanvases?: string[];
};

export const useWorkspaceStore = defineStore("workspace", () => {
  const project = ref<Project | null>(null);
  const projectList = ref<Project[]>([]);
  const projectLoading = ref(false);
  const projectLoadingDrawn = ref(false);
  const projectLoadingVisible = ref(false);
  const pendingAgentMessage = ref<{ directory: string; prompt: string; attachments?: AgentAttachment[]; model: string; reasoningEffort: string } | null>(null);

  async function addProject(path: string, name?: string, signal?: AbortSignal, previousDirectory = path) {
    const { data } = await axios.get<{ code: number; data?: { directory: string }; message?: string }>("/api/workspaces/check", {
      params: { directory: path }, headers: { "x-toonflow-workspace": "1" }, signal,
    });
    signal?.throwIfAborted();
    if (data.code !== 200 || !data.data?.directory) throw new Error(data.message || "工作目录校验失败");
    const checkedDirectory = data.data.directory;
    const existing = projectList.value.find(project => project.directory === previousDirectory)
      ?? projectList.value.find(project => project.directory === checkedDirectory);
    const added: Project = {
      directory: checkedDirectory, name: name?.trim() || existing?.name || checkedDirectory.split(/[\\/]/).filter(Boolean).at(-1) || checkedDirectory, lastOpenedAt: Date.now(),
      ...(existing?.recentCanvases ? { recentCanvases: existing.recentCanvases } : {}),
      ...(existing?.pinnedCanvases ? { pinnedCanvases: existing.pinnedCanvases } : {}),
    };
    projectList.value = [
      added,
      ...projectList.value.filter(item => item.directory !== previousDirectory && item.directory !== checkedDirectory),
    ];
    return added;
  }

  async function openProject(path: string, previousDirectory = path, signal?: AbortSignal) {
    project.value = await addProject(path, undefined, signal, previousDirectory);
    pendingAgentMessage.value = null;
  }

  function renameProject(path: string, name: string) {
    const target = projectList.value.find(item => item.directory === path);
    if (!target || !name.trim()) return;
    target.name = name.trim();
    if (project.value?.directory === path) project.value = target;
  }

  function removeProject(path: string) {
    projectList.value = projectList.value.filter(item => item.directory !== path);
    if (project.value?.directory === path) project.value = null;
  }

  /** 记住项目最近打开的画布，供进入项目和画布切换弹窗默认定位。 */
  function rememberCanvas(path: string, canvasId: string) {
    if (!canvasId) return;
    for (const item of new Set([project.value, ...projectList.value])) {
      if (item?.directory !== path || item.recentCanvases?.[0] === canvasId) continue;
      item.recentCanvases = [canvasId, ...(item.recentCanvases ?? []).filter(id => id !== canvasId)].slice(0, 10);
    }
  }

  function togglePinnedCanvas(path: string, canvasId: string) {
    const target = projectList.value.find(item => item.directory === path) ?? (project.value?.directory === path ? project.value : undefined);
    if (!target || !canvasId) return;
    const pinned = target.pinnedCanvases ?? [];
    const next = pinned.includes(canvasId) ? pinned.filter(id => id !== canvasId) : [...pinned, canvasId];
    for (const item of new Set([project.value, ...projectList.value])) {
      if (item?.directory === path) item.pinnedCanvases = [...next];
    }
  }

  /** 仅在磁盘操作成功后同步画布与文件夹路径，保留原有访问和常用顺序。 */
  function syncCanvasPath(path: string, previous: string, target?: string) {
    const remap = (ids: string[] | undefined) => [...new Set((ids ?? []).flatMap(id => {
      if (id !== previous && !id.startsWith(`${previous}/`)) return [id];
      return target === undefined ? [] : [`${target}${id.slice(previous.length)}`];
    }))];
    for (const item of new Set([project.value, ...projectList.value])) {
      if (item?.directory !== path) continue;
      if (item.recentCanvases) item.recentCanvases = remap(item.recentCanvases);
      if (item.pinnedCanvases) item.pinnedCanvases = remap(item.pinnedCanvases);
    }
  }

  return { project, projectList, projectLoading, projectLoadingDrawn, projectLoadingVisible, pendingAgentMessage, addProject, openProject, renameProject, removeProject, rememberCanvas, togglePinnedCanvas, syncCanvasPath };
}, {
  persist: {
    key: "toonflow.projectList",
    pick: ["project", "projectList"],
  },
});
