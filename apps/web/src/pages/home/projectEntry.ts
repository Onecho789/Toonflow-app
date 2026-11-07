import axios from "axios";
import { onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { waitForControlValue } from "@/lib/mcpControl";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { createEmptyCanvas, isCanvasFile } from "@/pages/workspace/canvasFile";
import type workspacePicker from "./workspacePicker.vue";

// 首页与无限画布页共用：先选择画布，再打开项目；文件夹丢失时重新选择。
export default function useProjectEntry() {
  const router = useRouter();
  const workspaceStore = useWorkspaceStore();
  const pageLifetime = new AbortController();
  const creating = ref(false);
  const opening = ref(false);
  const relocationPicker = ref<InstanceType<typeof workspacePicker>>();
  const pickingProject = ref<Project>();
  const pickerVisible = ref(false);

  watch([creating, opening], ([creating, opening]) => {
    if (!creating && !opening && router.currentRoute.value.path !== "/workspace") workspaceStore.projectLoading = false;
  }, { flush: "sync" });

  onUnmounted(() => {
    pageLifetime.abort();
    if (router.currentRoute.value.path !== "/workspace") workspaceStore.projectLoading = false;
  });

  async function enterWorkspace() {
    workspaceStore.projectLoadingDrawn = false;
    workspaceStore.projectLoading = true;
    await waitForControlValue(() => workspaceStore.projectLoadingDrawn || undefined, pageLifetime.signal).catch(error => {
      if (!pageLifetime.signal.aborted) throw error;
    });
    if (pageLifetime.signal.aborted) return;
    if (!document.hidden) await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (pageLifetime.signal.aborted) return;
    await router.push("/workspace");
  }

  /** 未指定画布时只校验项目并打开选择器，选择完成后才切换当前工作区。 */
  async function openProject(project: Project, canvasId?: string) {
    if (creating.value || opening.value || pageLifetime.signal.aborted) return;
    opening.value = true;
    const directory = project.directory;
    try {
      const signal = pageLifetime.signal;
      try {
        if (canvasId) {
          await workspaceStore.openProject(directory, directory, signal);
          pickingProject.value = workspaceStore.project!;
          if (!await isCanvasFile(useWorkspaceFiles(workspaceStore.project!.directory), canvasId, signal)) throw new Error("所选画布已不存在或格式无效，请重新选择");
        } else {
          pickingProject.value = await workspaceStore.addProject(directory, undefined, signal);
        }
      } catch (err) {
        if (signal.aborted || !axios.isAxiosError(err) || err.response?.status !== 404) throw err;
        const reselect = await ElMessageBox.confirm(`项目“${project.name}”的文件夹不存在，是否重新选择文件夹？`, "工作目录不存在", {
          confirmButtonText: "重新选择", cancelButtonText: "取消", type: "warning",
        }).then(() => true, () => false);
        if (!reselect || signal.aborted) return;
        const directory = await relocationPicker.value?.chooseDirectory();
        if (!directory || signal.aborted) return;
        pickingProject.value = await workspaceStore.addProject(directory, undefined, signal, project.directory);
        // 重新定位后重新选择，避免旧目录的画布路径被带入其他项目。
        canvasId = undefined;
      }
      signal.throwIfAborted();
      if (!canvasId) {
        pickerVisible.value = true;
        return;
      }
      if (workspaceStore.project) workspaceStore.rememberCanvas(workspaceStore.project.directory, canvasId);
      pickerVisible.value = false;
      await enterWorkspace();
    } catch (err) {
      if (pageLifetime.signal.aborted) return;
      ElMessage.error(axios.isAxiosError<{ message?: string }>(err)
        ? err.response?.data.message || "无法打开项目，请重试"
        : err instanceof Error ? err.message : "无法打开项目，请重试");
    } finally { opening.value = false; }
  }

  function enterCanvas(canvas: { id: string }) {
    if (pickingProject.value) void openProject(pickingProject.value, canvas.id);
  }

  async function createCanvas(folder: string) {
    const project = pickingProject.value;
    if (!project || creating.value || opening.value || pageLifetime.signal.aborted) return;
    creating.value = true;
    const directory = project.directory;
    try {
      const canvas = await createEmptyCanvas(useWorkspaceFiles(directory), folder, pageLifetime.signal);
      pageLifetime.signal.throwIfAborted();
      await workspaceStore.openProject(directory, directory, pageLifetime.signal);
      workspaceStore.rememberCanvas(workspaceStore.project!.directory, canvas.id);
      pickerVisible.value = false;
      await enterWorkspace();
    } catch (err) {
      if (pageLifetime.signal.aborted) return;
      ElMessage.error(axios.isAxiosError<{ message?: string }>(err)
        ? err.response?.data.message || "新增画布失败，请重试"
        : err instanceof Error ? err.message : "新增画布失败，请重试");
    } finally { creating.value = false; }
  }

  return { pageLifetime, creating, opening, relocationPicker, pickingProject, pickerVisible, enterWorkspace, openProject, enterCanvas, createCanvas };
}
