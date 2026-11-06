import axios from "axios";
import { onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { waitForControlValue } from "@/lib/mcpControl";
import type workspacePicker from "./workspacePicker.vue";

// 首页与无限画布页共用：打开项目、加载页过渡、文件夹丢失时重新选择。
export default function useProjectEntry() {
  const router = useRouter();
  const workspaceStore = useWorkspaceStore();
  const pageLifetime = new AbortController();
  const creating = ref(false);
  const opening = ref(false);
  const relocationPicker = ref<InstanceType<typeof workspacePicker>>();

  watch([creating, opening], ([creating, opening]) => {
    if (creating || opening) {
      workspaceStore.projectLoadingDrawn = false;
      workspaceStore.projectLoading = true;
    } else if (router.currentRoute.value.path !== "/workspace") {
      workspaceStore.projectLoading = false;
    }
  }, { flush: "sync" });

  onUnmounted(() => {
    pageLifetime.abort();
    if (router.currentRoute.value.path !== "/workspace") workspaceStore.projectLoading = false;
  });

  async function enterWorkspace() {
    await waitForControlValue(() => workspaceStore.projectLoadingDrawn || undefined, pageLifetime.signal).catch(error => {
      if (!pageLifetime.signal.aborted) throw error;
    });
    if (pageLifetime.signal.aborted) return;
    if (!document.hidden) await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (pageLifetime.signal.aborted) return;
    await router.push("/workspace");
  }

  /** 打开项目；传入 canvasId 时先记为最近画布，进入工作区后直接打开它。 */
  async function openProject(project: Project, canvasId?: string) {
    if (creating.value || opening.value) return;
    opening.value = true;
    try {
      const directory = project.directory;
      try { await workspaceStore.openProject(directory); }
      catch (err) {
        if (!axios.isAxiosError(err) || err.response?.status !== 404) throw err;
        const reselect = await ElMessageBox.confirm(`项目“${project.name}”的文件夹不存在，是否重新选择文件夹？`, "工作目录不存在", {
          confirmButtonText: "重新选择", cancelButtonText: "取消", type: "warning",
        }).then(() => true, () => false);
        if (!reselect) return;
        const directory = await relocationPicker.value?.chooseDirectory();
        if (!directory) return;
        await workspaceStore.openProject(directory, project.directory);
      }
      if (canvasId && workspaceStore.project) workspaceStore.rememberCanvas(workspaceStore.project.directory, canvasId);
      await enterWorkspace();
    } catch (err) {
      ElMessage.error(axios.isAxiosError<{ message?: string }>(err)
        ? err.response?.data.message || "无法打开项目，请重试"
        : err instanceof Error ? err.message : "无法打开项目，请重试");
    } finally { opening.value = false; }
  }

  return { pageLifetime, creating, opening, relocationPicker, enterWorkspace, openProject };
}
