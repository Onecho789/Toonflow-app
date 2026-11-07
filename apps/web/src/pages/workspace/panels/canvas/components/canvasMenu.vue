<template>
  <panel class="canvasMenuPanel" position="top-left">
    <el-card class="canvasMenu" shadow="never" :bodyStyle="{ padding: '1px 4px' }">
      <div class="menuContent">
        <el-input v-model="projectNameDraft" class="workspaceNameInput" :style="{ '--workspaceName': JSON.stringify(projectNameDraft || ' ') }" size="small"
          :title="`${workspaceName} · 点击修改项目名称`" :disabled="!workspaceStore.project" aria-label="项目名称，点击修改"
          @keydown.stop @keydown.enter="saveProjectName" @keydown.esc.prevent="projectNameDraft = workspaceName" @blur="saveProjectName" />
        <span class="contextDivider" aria-hidden="true">/</span>
        <el-button class="canvasTrigger" text :loading="busy" :disabled="busy || !directory" :title="`切换画布：${activeCanvasId || '选择画布'}${switchShortcut ? ` · ${switchShortcut}` : ''}`"
          :aria-label="`切换画布，当前${activeCanvasName}`" aria-haspopup="dialog" :aria-expanded="pickerVisible" @click="openPicker">
          <span class="triggerName">{{ activeCanvasName }}</span>
          <icon-chevron-down class="triggerArrow" :size="14" aria-hidden="true" />
          <kbd v-if="switchShortcut" class="triggerKey">{{ switchShortcut }}</kbd>
        </el-button>
        <input ref="importInput" type="file" accept=".json,application/json" hidden aria-label="选择画布 JSON 文件" @change="handleImportCanvas" />
      </div>
    </el-card>
    <div class="menuExtension"><slot /></div>
  </panel>
  <panel v-if="cloudBalance" class="balanceMenuPanel" position="top-right">
    <el-card class="balanceCard" shadow="never" :bodyStyle="{ padding: '2px 4px' }">
      <el-button class="balanceTrigger" text :loading="cloudBalanceLoading" :title="cloudBalanceError || '点击刷新麦浪余额'" :aria-label="`麦浪余额 ${cloudBalanceText}，点击刷新`" @click="loadCloudBalance">
        <mailangBalance />
      </el-button>
    </el-card>
  </panel>
  <canvasPickerDialog ref="picker" v-model="pickerVisible" :directory="directory ?? ''" :projectName="workspaceName" :activeId="activeCanvasId" :openIds="openIds"
    :recentIds="recentCanvases" :pinnedIds="pinnedCanvases" :busy="busy" :shortcut="switchShortcut" @select="selectCanvas" @create="handleCreateCanvas" @import="importInput?.click()"
    @export="handleExportCanvas" @action="handlePickerAction" @togglePin="path => directory && workspaceStore.togglePinnedCanvas(directory, path)" />
</template>

<script setup lang="ts">
import axios from "axios";
import { translate } from "@toonflow/i18n/vue";
import { computed, inject, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Ref, type ShallowRef } from "vue";
import { Panel, useVueFlow, type Edge, type FlowExportObject, type Node, type ViewportTransform } from "@vue-flow/core";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconChevronDown } from "@tabler/icons-vue";
import { useNodeEvent } from "@toonflow/nodes-scaffold/nodeEvent";
import saveFile from "@/lib/saveFile";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { createEmptyCanvas, getCanvasAssetDirectories, isCanvasFile } from "@/pages/workspace/canvasFile";
import { findRemainingCanvas, remapNodeReferences } from "../canvasFiles";
import { isGroupInputEdge } from "../groupInputs";
import { cloudBalance, cloudBalanceText, cloudBalanceError, cloudBalanceLoading, loadCloudBalance } from "@/stores/cloudAccount";
import mailangBalance from "@/components/mailangBalance.vue";
import { shortcutLabel } from "@/lib/canvasShortcuts";
import { generalSettings } from "@/stores/settings";
import canvasPickerDialog, { type CanvasPickerAction } from "./canvasPickerDialog.vue";

const props = defineProps<{
  directory?: string;
  initialCanvasId?: string;
  activateCanvas?: (id: string, signal?: AbortSignal) => Promise<void>;
  flushSave: (action?: () => Promise<void>) => Promise<void>;
}>();
const workspaceStore = useWorkspaceStore();
const workspaceName = computed(() => workspaceStore.project?.name || translate("未命名工作区"));
const projectNameDraft = ref("");
watch([() => workspaceStore.project?.directory, workspaceName], () => {
  projectNameDraft.value = workspaceName.value;
}, { immediate: true });

function saveProjectName(event: Event) {
  if (event instanceof KeyboardEvent && event.isComposing) return;
  const project = workspaceStore.project;
  if (project) workspaceStore.renameProject(project.directory, projectNameDraft.value);
  projectNameDraft.value = workspaceName.value;
}

type Canvas = { id: string; name: string; flow?: Pick<FlowExportObject, "nodes" | "edges" | "viewport"> };
const canvases = inject<ShallowRef<Canvas[]>>("canvasList", shallowRef<Canvas[]>([]));
const getRetainedNodes = inject<(id: string) => { id: string; data?: unknown }[]>("canvasAssetNodes", () => []);
const performFileAction = inject<(directory: string, action: "copy" | "rename" | "move" | "delete", path: string, target?: string, entryType?: "canvas" | "directory") => Promise<void>>("performWorkspaceFileAction");
const boundCanvas = shallowRef<Canvas>();
const activeCanvasId = defineModel<string>("canvasId", { default: "" });
watch(canvases, () => {
  if (boundCanvas.value) activeCanvasId.value = canvases.value.includes(boundCanvas.value) ? boundCanvas.value.id : "";
}, { flush: "sync" });
const pickerVisible = ref(false);
const picker = ref<InstanceType<typeof canvasPickerDialog>>();
const activeCanvasName = computed(() => canvases.value.find(canvas => canvas.id === activeCanvasId.value)?.name || translate("选择画布"));
const switchShortcut = computed(() => shortcutLabel(generalSettings.value.canvasShortcuts.switchCanvas).split(" / ")[0] ?? "");
const recentCanvases = computed(() => workspaceStore.project?.directory === props.directory ? workspaceStore.project?.recentCanvases ?? [] : []);
const pinnedCanvases = computed(() => workspaceStore.project?.directory === props.directory ? workspaceStore.project?.pinnedCanvases ?? [] : []);
const openIds = inject<Readonly<Ref<string[]>>>("canvasOpenIds", computed(() => []));
const busy = ref(false);
const initialized = ref(false);
const loadError = ref("");
const flow = useVueFlow();
const { toObject, setNodes, setEdges, setViewport } = flow;
const importInput = ref<HTMLInputElement>();
type CanvasEntry = { path: string; name: string; type: "file" | "directory"; children?: CanvasEntry[]; empty?: boolean };
const folders = inject<ShallowRef<CanvasEntry[]>>("canvasFolders", shallowRef<CanvasEntry[]>([]));
const loadedDirectories = inject<ShallowRef<string[]>>("canvasLoadedDirectories", shallowRef<string[]>([]));
const pendingDirectories = new Map<string, Promise<void>>();
let treeController = new AbortController();

function parentPath(path: string) { return path.slice(0, path.lastIndexOf("/") + 1).replace(/\/$/, ""); }
onBeforeUnmount(() => treeController.abort());

function mergeCanvases(loaded: Canvas[]) {
  const known = new Set(canvases.value.map(canvas => canvas.id));
  const added = loaded.filter(canvas => !known.has(canvas.id));
  if (added.length) canvases.value = [...canvases.value, ...added];
}

async function loadDirectory(path: string) {
  if (loadedDirectories.value.includes(path)) return;
  const pending = pendingDirectories.get(path);
  if (pending) return pending;
  const directory = props.directory;
  if (!directory) return;
  const signal = treeController.signal;
  const task = (async () => {
    const loaded = await listCanvases(directory, path, false, signal);
    checkCanvasDirectory(directory, signal);
    const names = new Set(loaded.folders.map(folder => folder.path));
    const removed = folders.value.filter(folder => parentPath(folder.path) === path && !names.has(folder.path)).map(folder => folder.path);
    loadedDirectories.value = [...loadedDirectories.value.filter(value => !removed.some(folder => value === folder || value.startsWith(`${folder}/`))), path];
    folders.value = [...folders.value.filter(folder => parentPath(folder.path) !== path && !removed.some(value => folder.path.startsWith(`${value}/`)))
      .map(folder => folder.path === path ? { ...folder, empty: loaded.empty } : folder), ...loaded.folders];
    mergeCanvases(loaded.canvases);
  })();
  pendingDirectories.set(path, task);
  try { await task; }
  finally { if (pendingDirectories.get(path) === task) pendingDirectories.delete(path); }
}

/** 文件操作后刷新弹窗与共享目录缓存；弹窗自己会重新递归读取画布。 */
async function refreshTree() {
  loadedDirectories.value = [];
  pendingDirectories.clear();
  await picker.value?.reload();
}

watch(() => props.directory, async (directory, _previous, onCleanup) => {
  let cancelled = false;
  treeController.abort();
  treeController = new AbortController();
  const controller = treeController;
  onCleanup(() => { cancelled = true; controller.abort(); });
  pendingDirectories.clear();
  initialized.value = false;
  busy.value = true;
  loadError.value = "";
  if (props.initialCanvasId === undefined) { folders.value = []; loadedDirectories.value = []; }
  pickerVisible.value = false;
  boundCanvas.value = undefined;
  activeCanvasId.value = "";
  try {
    if (props.initialCanvasId === undefined) canvases.value = [];
    if (!directory) return;
    if (props.initialCanvasId) {
      await applyCanvas(props.initialCanvasId, directory);
      return;
    }
    await loadDirectory("");
    // ACT: 根目录无画布时逐层查找，找到即停止；其余目录仍按需加载。
    for (let index = 0; !canvases.value.length && index < folders.value.length; index++) {
      await loadDirectory(folders.value[index]!.path);
    }
    if (cancelled) return;
    if (!canvases.value.length) {
      try {
        const canvas = await createCanvasFile(directory, "画布1", controller.signal);
        checkCanvasDirectory(directory, controller.signal);
        mergeCanvases([canvas]);
      } catch (err) {
        if (!axios.isAxiosError<{ data?: { code?: string } }>(err) || err.response?.status !== 409 || err.response.data.data?.code !== "EEXIST") throw err;
        // 同时打开工作区时，读取另一请求刚创建的默认画布，不覆盖同名文件。
        loadedDirectories.value = loadedDirectories.value.filter(path => path !== "");
        await loadDirectory("");
        // 画布1.json 若被其他 JSON 占用，则使用下一个空闲名称，保留原文件。
        if (!canvases.value.length) {
          const canvas = await createCanvasFile(directory, undefined, controller.signal);
          checkCanvasDirectory(directory, controller.signal);
          mergeCanvases([canvas]);
        }
      }
    }
    if (cancelled) return;
    // 优先恢复最近打开的画布（首页进入时选择的画布也记在这里），文件已不存在则回退到第一个。
    const files = useWorkspaceFiles(directory);
    for (const id of workspaceStore.project?.directory === directory ? workspaceStore.project.recentCanvases ?? [] : []) {
      if (canvases.value.some(canvas => canvas.id === id) || await isCanvasFile(files, id, controller.signal)) {
        mergeCanvases([{ id, name: id.split("/").at(-1)!.replace(/\.json$/i, "") }]);
        await applyCanvas(id, directory, controller.signal);
        return;
      }
      if (cancelled) return;
    }
    if (canvases.value[0]) await applyCanvas(canvases.value[0].id, directory, controller.signal);
  } catch (err) {
    if (!cancelled) {
      loadError.value = errorMessage(err, "读取画布失败");
      if (!props.initialCanvasId) ElMessage.error(loadError.value);
    }
  } finally {
    if (!cancelled) { busy.value = false; initialized.value = true; }
  }
}, { immediate: true });

function errorMessage(err: unknown, fallback: string) {
  return axios.isAxiosError<{ message?: string }>(err) ? err.response?.data.message || fallback : err instanceof Error ? err.message : fallback;
}

function peekCanvases() {
  return canvases.value.map(({ id, name }) => ({ id, name }));
}

async function getCanvases(signal?: AbortSignal) {
  const directory = getCanvasDirectory(signal);
  const callSignal = AbortSignal.any([treeController.signal, ...(signal ? [signal] : [])]);
  const loaded = await listCanvases(directory, "", true, callSignal);
  checkCanvasDirectory(directory, callSignal);
  loadedDirectories.value = ["", ...loaded.folders.map(folder => folder.path)];
  folders.value = loaded.folders;
  mergeCanvases(loaded.canvases);
  return loaded.canvases.map(({ id, name }) => ({ id, name }));
}

function getCanvasDirectory(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!props.directory) throw new Error("请先选择工作目录");
  if (busy.value) throw new Error("画布正在加载，请稍后重试");
  return props.directory;
}

function checkCanvasDirectory(directory: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (props.directory !== directory) throw new Error("工作目录已切换，本次画布操作已停止");
}

async function applyCanvas(canvasId: string, directory: string, signal?: AbortSignal) {
  checkCanvasDirectory(directory, signal);
  const nextCanvas = canvases.value.find(canvas => canvas.id === canvasId);
  const currentCanvas = canvases.value.find(canvas => canvas.id === activeCanvasId.value);
  if (!nextCanvas) throw new Error("画布不存在，请重新获取画布列表");
  if (nextCanvas === currentCanvas) return;
  if (currentCanvas && props.activateCanvas) {
    await props.activateCanvas(canvasId, signal);
    checkCanvasDirectory(directory, signal);
    return;
  }
  if (!nextCanvas.flow) {
    const data = await useWorkspaceFiles(directory).readJson<Partial<NonNullable<Canvas["flow"]>> & { toonflowCanvas?: boolean } | null>(nextCanvas.id);
    checkCanvasDirectory(directory, signal);
    if (data?.toonflowCanvas !== true || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || !data.viewport
      || ![data.viewport.x, data.viewport.y, data.viewport.zoom].every(Number.isFinite) || data.viewport.zoom <= 0) throw new Error("画布文件格式无效");
    // 旧画布可能保存了临时导出进度，重新打开时任务已不存在。
    for (const node of data.nodes) if (node.type === "remote-videoNode" && node.data) delete node.data.exportProgress;
    nextCanvas.flow = { nodes: data.nodes, edges: data.edges, viewport: data.viewport };
  }
  await props.flushSave();
  checkCanvasDirectory(directory, signal);
  if (currentCanvas) currentCanvas.flow = toObject();
  // 应用画布数据时暂时清空文件名，避免初始化触发自动保存。
  activeCanvasId.value = "";
  setNodes(nextCanvas.flow.nodes);
  // 命中宽度由画布统一配置，不使用旧文件中的覆盖值。
  setEdges(nextCanvas.flow.edges.map(({ interactionWidth, ...edge }) => edge));
  await setViewport(nextCanvas.flow.viewport);
  await nextTick();
  checkCanvasDirectory(directory);
  boundCanvas.value = nextCanvas;
  activeCanvasId.value = nextCanvas.id;
  signal?.throwIfAborted();
}

async function switchCanvas(canvasId: string, signal?: AbortSignal) {
  const directory = getCanvasDirectory(signal);
  pickerVisible.value = false;
  busy.value = true;
  try {
    if (props.activateCanvas) await props.activateCanvas(canvasId, signal);
    else await applyCanvas(canvasId, directory, signal);
    checkCanvasDirectory(directory, signal);
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function handleSwitchCanvas(canvasId: string) {
  const directory = props.directory;
  try {
    await switchCanvas(canvasId);
  } catch (err) {
    if (props.directory === directory) ElMessage.error(errorMessage(err, "切换画布失败"));
  }
}

async function removeCanvas(canvas: Canvas) {
  if (busy.value || !props.directory) return;
  const directory = props.directory;
  const id = canvas.id;
  busy.value = true;
  try {
    const files = useWorkspaceFiles(directory);
    const nextCanvas = await findRemainingCanvas(files, id, treeController.signal);
    checkCanvasDirectory(directory, treeController.signal);
    if (!nextCanvas) {
      ElMessage.warning("项目里需要保留至少一个画布。你可以先新建一个，再删除这个画布。");
      return;
    }
    mergeCanvases([nextCanvas]);
    const confirmed = await ElMessageBox.confirm(`确定删除画布“${canvas.name}”吗？对应的“${id}”文件及仅由这个画布使用的素材也会删除，其他画布共用的素材会保留。删除后无法恢复。`, "删除画布", {
      type: "warning", confirmButtonText: "删除", cancelButtonText: "取消", closeOnClickModal: false,
    }).then(() => true, () => false);
    if (!confirmed) return;
    checkCanvasDirectory(directory);
    if (activeCanvasId.value === id) await applyCanvas(nextCanvas.id, directory);
    const readNodes = async (canvasId: string) => {
      const data = await files.readJson<{ toonflowCanvas?: boolean; nodes?: { id: string; data?: unknown }[] }>(canvasId);
      if (data?.toonflowCanvas !== true || !Array.isArray(data.nodes) || data.nodes.some(node => !node || typeof node.id !== "string")) {
        throw new Error(`无法确认画布“${canvasId}”的素材引用，已停止后续删除操作。`);
      }
      return [...data.nodes, ...getRetainedNodes(canvasId)];
    };
    let removedNodes: { id: string; data?: unknown }[] = [];
    await props.flushSave(async () => {
      checkCanvasDirectory(directory);
      if (canvas.id !== id || !canvases.value.includes(canvas)) throw new Error("画布已变更，请重新选择");
      removedNodes = await readNodes(id);
      if (!performFileAction) {
        await files.remove(id);
        workspaceStore.syncCanvasPath(directory, id);
        checkCanvasDirectory(directory);
        canvases.value = canvases.value.filter(item => item !== canvas);
        await nextTick();
      }
    });
    // coordinator 自己进入保存临界区，必须在上一次 flush 完成后调用，避免重入保存队列。
    if (performFileAction) await performFileAction(directory, "delete", id);
    await props.flushSave(async () => {
      checkCanvasDirectory(directory);
      const retainedNodes = (await Promise.all((await listCanvases(directory, "", true)).canvases.map(canvas => readNodes(canvas.id)))).flat();
      const assetDirectories = getCanvasAssetDirectories(removedNodes, retainedNodes);
      checkCanvasDirectory(directory);
      const results = await Promise.allSettled(assetDirectories.map(path => files.remove(path, true).catch(error => {
        if (!axios.isAxiosError<{ data?: { code?: string } }>(error) || error.response?.data.data?.code !== "ENOENT") throw error;
      })));
      const failed = results.flatMap((result, index) => result.status === "rejected" ? [assetDirectories[index]] : []);
      if (failed.length) throw new Error(`画布已删除，但 ${failed.length} 个素材目录清理失败：${failed.join("、")}`);
    });
    if (props.directory === directory) ElMessage.success("画布已删除");
  } catch (err) {
    if (props.directory === directory) ElMessage.error(errorMessage(err, "删除画布失败"));
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function createCanvasFile(directory: string, name?: string, signal?: AbortSignal, folder = "") {
  checkCanvasDirectory(directory, signal);
  const files = useWorkspaceFiles(directory);
  if (name === undefined) return createEmptyCanvas(files, folder, AbortSignal.any([treeController.signal, ...(signal ? [signal] : [])]));
  const canvasName = normalizeCanvasName(name);
  const id = `${folder ? `${folder}/` : ""}${canvasName}.json`;
  const flow = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  await files.writeJson(id, { toonflowCanvas: true, ...flow }, true);
  return { id, name: canvasName, flow };
}

async function listCanvasEntries(directory: string, path = "", recursive = false, signal?: AbortSignal) {
  const files = useWorkspaceFiles(directory);
  const { entries, empty } = await files.list(path, signal);
  const folders: CanvasEntry[] = [];
  // ACT: 每次只读当前一层；完整查询仅由搜索、Agent 列举及文件操作显式触发。
  for (let index = 0; index < entries.length; index++) {
    checkCanvasDirectory(directory, signal);
    const entry = entries[index]!;
    if (entry.type !== "directory" || ["assets", ".agent"].includes(entry.name.toLowerCase())) continue;
    const folder: CanvasEntry = { ...entry };
    folders.push(folder);
    if (recursive) {
      const children = await files.list(entry.path, signal);
      folder.empty = children.empty;
      entries.push(...children.entries);
    }
  }
  return { entries, empty, folders: folders.sort((left, right) => left.path.localeCompare(right.path, "zh-CN", { numeric: true })) };
}

async function listCanvases(directory: string, path = "", recursive = false, signal?: AbortSignal) {
  const files = useWorkspaceFiles(directory);
  const { entries, folders, empty } = await listCanvasEntries(directory, path, recursive, signal);
  const loaded = await Promise.all(entries.filter(entry => entry.type === "file" && /\.json$/i.test(entry.name)).map(async entry => {
    if (!(await isCanvasFile(files, entry.path, signal))) return null;
    return { id: entry.path, name: entry.name.slice(0, -5) };
  }));
  return {
    canvases: loaded.filter(canvas => canvas !== null).sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true })),
    folders,
    empty,
  };
}

async function addCanvas(name?: string, signal?: AbortSignal): Promise<string> {
  const directory = getCanvasDirectory(signal);
  busy.value = true;
  try {
    const canvas = await createCanvasFile(directory, name, signal);
    checkCanvasDirectory(directory);
    canvases.value = [...canvases.value, canvas];
    signal?.throwIfAborted();
    await applyCanvas(canvas.id, directory, signal);
    pickerVisible.value = false;
    return canvas.id;
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

function openPicker() {
  if (!busy.value && props.directory) pickerVisible.value = true;
}

async function selectCanvas(canvas: { id: string; name: string }) {
  if (canvas.id === activeCanvasId.value) { pickerVisible.value = false; return; }
  mergeCanvases([canvas]);
  await handleSwitchCanvas(canvas.id);
}

async function handleCreateCanvas(folder: string) {
  const directory = props.directory;
  if (!directory || busy.value) return;
  busy.value = true;
  try {
    const canvas = await createCanvasFile(directory, undefined, undefined, folder);
    checkCanvasDirectory(directory);
    canvases.value = [...canvases.value, canvas];
    await applyCanvas(canvas.id, directory);
    pickerVisible.value = false;
  } catch (err) {
    if (props.directory === directory) ElMessage.error(errorMessage(err, "新增画布失败"));
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

/** 弹出名称输入框；校验与文件名规则一致，取消时返回 undefined。 */
async function promptName(title: string, label: string, value: string, normalize: (name: string) => string, confirmButtonText = translate("保存")) {
  try {
    const result = await ElMessageBox.prompt(label, title, {
      inputValue: value, confirmButtonText, cancelButtonText: translate("取消"),
      inputValidator: name => { try { normalize(name); return true; } catch (error) { return (error as Error).message; } },
    });
    return normalize(result.value);
  } catch { return undefined; }
}

function canvasEntry(path: string): Canvas {
  return canvases.value.find(canvas => canvas.id === path) ?? { id: path, name: path.split("/").at(-1)!.replace(/\.json$/i, "") };
}

async function handlePickerAction(command: CanvasPickerAction, path: string, target?: string) {
  const directory = props.directory;
  if (!directory || busy.value) return;
  const canvas = canvasEntry(path);
  const folderName = path.split("/").at(-1)!;
  const prefix = parentPath(path) ? `${parentPath(path)}/` : "";
  if (command === "delete") {
    mergeCanvases([canvas]);
    await removeCanvas(canvases.value.find(item => item.id === path)!);
    await refreshTree();
    return;
  }
  let name: string | undefined;
  if (command === "rename") name = await promptName(translate("重命名画布"), translate("画布名称"), canvas.name, normalizeCanvasName);
  else if (command === "renameFolder") name = await promptName(translate("重命名文件夹"), translate("文件夹名称"), folderName, normalizeFolderName);
  else if (command === "createFolder") name = await promptName(translate("新建文件夹"), translate("文件夹将创建在画布根目录"), translate("新建文件夹"), normalizeFolderName, translate("创建"));
  else if (command === "move" && target === undefined) {
    name = await promptName(translate("新建文件夹"), translate("新文件夹将创建在画布根目录"), translate("新建文件夹"), normalizeFolderName, translate("创建并移动"));
    if (name !== undefined) { target = name; name = "mkdir"; }
  } else if (command === "deleteFolder") {
    const confirmed = await ElMessageBox.confirm(translate(`确定删除文件夹“${folderName}”？`), translate("删除文件夹"), {
      type: "warning", confirmButtonText: translate("删除"), cancelButtonText: translate("取消"),
    }).then(() => true, () => false);
    if (confirmed) name = folderName;
  } else name = canvas.name;
  if (name === undefined || directory !== props.directory) return;
  busy.value = true;
  try {
    const files = useWorkspaceFiles(directory);
    if (command === "rename") {
      mergeCanvases([canvas]);
      await renameCanvasFile(path, name, directory);
    } else if (command === "renameFolder") {
      if (name !== folderName) await relocateEntry({ path, name: folderName, type: "directory" }, `${prefix}${name}`, directory);
    } else if (command === "createFolder") {
      await files.mkdir(name);
    } else if (command === "deleteFolder") {
      // 只删除真实空目录；隐藏文件和普通文档也应阻止删除。
      await files.remove(path);
    } else if (command === "move") {
      if (name === "mkdir") await files.mkdir(target!);
      checkCanvasDirectory(directory);
      mergeCanvases([canvas]);
      await relocateEntry({ path, name: canvas.name, type: "file" }, `${target ? `${target}/` : ""}${path.split("/").at(-1)}`, directory);
    } else if (command === "copy") {
      if (!performFileAction) throw new Error("工作区文件管理尚未就绪");
      const listed = new Set((await files.list(parentPath(path))).entries.map(entry => entry.name.toLowerCase()));
      let copyName = translate(`${canvas.name} 副本`);
      for (let number = 2; listed.has(`${copyName}.json`.toLowerCase()); number++) copyName = translate(`${canvas.name} 副本 ${number}`);
      await performFileAction(directory, "copy", path, `${prefix}${copyName}.json`);
    }
    checkCanvasDirectory(directory);
    await refreshTree();
  } catch (err) {
    if (props.directory === directory) ElMessage.error(errorMessage(err, "画布操作失败"));
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

function normalizeFolderName(name: string) {
  name = normalizeCanvasName(name, "文件夹");
  if (name.toLowerCase() === "assets") throw new Error("“assets”是保留的节点素材目录名称，请使用其他文件夹名称。");
  if (name.toLowerCase() === ".agent") throw new Error("“.agent”是保留的 Agent 数据目录名称，请使用其他文件夹名称。");
  return name;
}

async function relocateEntry(entry: CanvasEntry, target: string, directory: string) {
  checkCanvasDirectory(directory);
  if (!performFileAction) throw new Error("工作区文件管理尚未就绪");
  await performFileAction(directory, "move", entry.path, target, entry.type === "directory" ? "directory" : "canvas");
  checkCanvasDirectory(directory);
}

function normalizeCanvasName(name: string, label = "画布") {
  name = name.trim();
  if (!name || name.length > 120 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error(label === "文件夹" ? "文件夹名称不是有效文件名" : "画布名称不是有效文件名");
  }
  return name;
}

async function renameCanvasFile(id: string, name: string, directory: string, signal?: AbortSignal) {
  checkCanvasDirectory(directory, signal);
  const canvas = canvases.value.find(item => item.id === id);
  if (!canvas) throw new Error("画布不存在，请重新获取画布列表");
  name = normalizeCanvasName(name);
  if (name === canvas.name) return;
  const target = `${id.slice(0, id.lastIndexOf("/") + 1)}${name}.json`;
  if (performFileAction) {
    await performFileAction(directory, "rename", id, target);
    checkCanvasDirectory(directory, signal);
    return;
  }
  await props.flushSave(async () => {
    checkCanvasDirectory(directory, signal);
    await useWorkspaceFiles(directory).rename(id, target);
    workspaceStore.syncCanvasPath(directory, id, target);
    checkCanvasDirectory(directory);
    // 文件已改名时先更新保存路径，再响应取消，避免自动保存重新创建旧文件。
    if (activeCanvasId.value === id) activeCanvasId.value = target;
    Object.assign(canvas, { id: target, name });
    canvases.value = [...canvases.value];
    signal?.throwIfAborted();
  });
  checkCanvasDirectory(directory, signal);
}

function syncCanvasPath(previous: string, target: string) {
  if (activeCanvasId.value === previous) activeCanvasId.value = target;
}

async function renameCanvas(canvasId: string, name: string, signal?: AbortSignal) {
  const directory = getCanvasDirectory(signal);
  busy.value = true;
  try {
    await renameCanvasFile(canvasId, name, directory, signal);
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

function syncDocumentNode(canvasId: string, nodeId: string, handleId: string, text: string, inline: boolean) {
  const node = canvases.value.find(canvas => canvas.id === canvasId)?.flow?.nodes.find(node => node.id === nodeId);
  if (!node) return;
  const data = node.data ??= {};
  const output = data.outputs?.[handleId];
  if (output?.dataType === "STRING") output.value = text;
  else if (inline) (data.outputs ??= {})[handleId] = { dataType: "STRING", value: text };
}

const canvasExportVersion = 1;
type CanvasExport = { toonflowCanvas: true; toonflowCanvasExport: number; nodes: Node[]; edges: Edge[]; viewport: ViewportTransform };

/** 导出当前画布；素材保留工作区相对路径，文本等节点正文按复制规则内联，导入时不依赖原节点文件。 */
async function exportCanvas(signal?: AbortSignal) {
  const directory = getCanvasDirectory(signal);
  const canvas = canvases.value.find(item => item.id === activeCanvasId.value);
  if (!canvas) throw new Error("请先选择画布");
  busy.value = true;
  try {
    await props.flushSave();
    checkCanvasDirectory(directory, signal);
    if (activeCanvasId.value !== canvas.id) throw new Error("画布已切换，请重新导出");
    const snapshot = toObject();
    const nodes = await Promise.all(snapshot.nodes.map(async node => {
      const patch = node.type === "canvasGroup" ? {} : await useNodeEvent(node.id, flow).emit("copy");
      const data = { ...node.data, ...patch };
      if (data.generationStatus === "running") delete data.generationStatus;
      Reflect.deleteProperty(node, "initialized");
      return JSON.parse(JSON.stringify({ ...node, data })) as Node;
    }));
    checkCanvasDirectory(directory, signal);
    if (activeCanvasId.value !== canvas.id) throw new Error("画布已切换，请重新导出");
    // 分组展开的隐藏连线由分组连线重新生成，不写入导出文件。
    const edges = snapshot.edges.filter(edge => !isGroupInputEdge(edge)).map(({ interactionWidth: _width, ...edge }) => edge);
    const payload: CanvasExport = { toonflowCanvas: true, toonflowCanvasExport: canvasExportVersion, nodes, edges, viewport: snapshot.viewport };
    const fileName = `${canvas.name.split("/").at(-1) || "画布"}.json`;
    const saved = await saveFile(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), fileName);
    return { saved, fileName, nodeCount: nodes.length, edgeCount: edges.length };
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function handleExportCanvas() {
  const directory = props.directory;
  try {
    const result = await exportCanvas();
    if (result.saved) ElMessage.success("画布 JSON 已导出");
  } catch (err) {
    if (props.directory === directory) ElMessage.error(errorMessage(err, "导出画布失败"));
  }
}

function parseCanvasExport(text: string): CanvasExport {
  let data: Partial<CanvasExport> | null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("画布 JSON 解析失败，请确认文件内容完整");
  }
  if (!data || typeof data !== "object" || data.toonflowCanvas !== true) throw new Error("这不是麦麦工坊的画布 JSON 文件");
  const version = data.toonflowCanvasExport;
  if (version !== undefined && (!Number.isInteger(version) || version < 1 || version > canvasExportVersion)) {
    throw new Error("画布 JSON 版本不受支持，请升级客户端后再导入");
  }
  const viewport = data.viewport ?? { x: 0, y: 0, zoom: 1 };
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)
    || ![viewport.x, viewport.y, viewport.zoom].every(Number.isFinite) || viewport.zoom <= 0
    || data.nodes.some(node => !node || typeof node !== "object" || typeof node.id !== "string" || !node.id || typeof node.type !== "string"
      || !node.position || ![node.position.x, node.position.y].every(Number.isFinite))) {
    throw new Error("画布 JSON 格式无效：节点或视口数据不完整");
  }
  const ids = new Set(data.nodes.map(node => node.id));
  if (ids.size !== data.nodes.length || data.edges.some(edge => !edge || typeof edge !== "object" || !ids.has(edge.source) || !ids.has(edge.target))) {
    throw new Error("画布 JSON 格式无效：节点重复或连线指向不存在的节点");
  }
  return { toonflowCanvas: true, toonflowCanvasExport: version ?? canvasExportVersion, nodes: data.nodes, edges: data.edges, viewport };
}

function importedCanvasName(fileName: string) {
  const name = fileName.replace(/\.json$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/[. ]+$/, "").trim().slice(0, 100);
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name) ? "导入画布" : name;
}

/** 把画布 JSON 导入为新画布；节点和连线换用新 id，名称冲突时自动追加序号。 */
async function importCanvas(file: File, signal?: AbortSignal) {
  const directory = getCanvasDirectory(signal);
  if (file.size > 50 * 1024 * 1024) throw new Error("画布 JSON 不能超过 50 MB");
  const data = parseCanvasExport(await file.text());
  checkCanvasDirectory(directory, signal);
  busy.value = true;
  try {
    const files = useWorkspaceFiles(directory);
    const ids = new Map(data.nodes.map(node => [node.id, crypto.randomUUID()]));
    const nodes = await Promise.all(data.nodes.map(async source => {
      const node = JSON.parse(JSON.stringify(source)) as Node;
      const nodeData = node.data ??= {};
      // ACT: 直接保存的画布文件可能只引用节点正文路径；导入时尽力读取为内联正文，读取失败则保留节点并清空路径。
      if (typeof nodeData.textPath === "string") {
        if (typeof nodeData.textSnapshot !== "string") nodeData.textSnapshot = await files.readText(nodeData.textPath, undefined, signal).catch(() => undefined);
        delete nodeData.textPath;
      }
      if (typeof nodeData.modelPath === "string") {
        nodeData.modelSnapshot ??= await files.readJson(nodeData.modelPath, signal).catch(() => undefined);
        delete nodeData.modelPath;
      }
      if (nodeData.generationStatus === "running") delete nodeData.generationStatus;
      remapNodeReferences(node, ids);
      Reflect.deleteProperty(node, "initialized");
      return { ...node, id: ids.get(source.id)!, parentNode: source.parentNode ? ids.get(source.parentNode) : undefined, selected: false };
    }));
    const edges = data.edges.filter(edge => !isGroupInputEdge(edge)).map(edge => ({
      ...edge, id: crypto.randomUUID(), source: ids.get(edge.source)!, target: ids.get(edge.target)!, selected: false,
    }));
    const flowData = { nodes, edges, viewport: { x: data.viewport.x, y: data.viewport.y, zoom: data.viewport.zoom } };
    const baseName = importedCanvasName(file.name);
    let canvas: Canvas | undefined;
    for (let number = 1; !canvas; number++) {
      checkCanvasDirectory(directory, signal);
      if (number > 999) throw new Error("同名画布过多，请先重命名导入文件");
      const name = number === 1 ? baseName : `${baseName} ${number}`;
      const id = `${name}.json`;
      try {
        await files.writeJson(id, { toonflowCanvas: true, ...flowData }, true);
        canvas = { id, name, flow: flowData };
      } catch (err) {
        if (!axios.isAxiosError<{ data?: { code?: string } }>(err) || err.response?.status !== 409 || err.response.data.data?.code !== "EEXIST") throw err;
      }
    }
    checkCanvasDirectory(directory);
    canvases.value = [...canvases.value, canvas];
    signal?.throwIfAborted();
    await applyCanvas(canvas.id, directory, signal);
    pickerVisible.value = false;
    return { id: canvas.id, name: canvas.name, nodeCount: nodes.length, edgeCount: edges.length };
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function handleImportCanvas(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !props.directory) return;
  const directory = props.directory;
  try {
    const result = await importCanvas(file);
    ElMessage.success(`已导入为画布「${result.name}」`);
  } catch (err) {
    if (props.directory === directory) ElMessage.error(errorMessage(err, "导入画布失败"));
  }
}

defineExpose({ getCanvases, peekCanvases, initialized, addCanvas, switchCanvas, openPicker, renameCanvas, exportCanvas, syncCanvasPath, syncDocumentNode, loadError });
</script>

<style lang="scss" scoped>
.canvasMenuPanel.vue-flow__panel {
  --canvasMenuOffset: 0px;
  left: 0;
  display: flex;
  align-items: center;
  max-width: calc(50% - 90px);
}

.balanceMenuPanel.vue-flow__panel {
  max-width: calc(50% - 90px);

  .balanceCard {
    .balanceTrigger {
      height: 28px;
      padding: 0 4px;
      font-size: 13px;
      :deep(> span) { display: flex; align-items: center; gap: 4px; }
    }
  }
}

.menuExtension {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
}

.canvasMenu {
  margin-left: 128px;
  min-width: 0;
  max-width: 380px;

  .menuContent {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 2px;

    .contextDivider { flex-shrink: 0; margin: 0 2px; color: var(--el-text-color-placeholder); font-size: 13px; }

    .workspaceNameInput {
      flex: 0 1 auto;
      width: auto;
      min-width: 40px;
      max-width: 170px;
      height: 32px;
      font-size: 13px;

      &::after {
        content: var(--workspaceName);
        padding: 0 5px;
        white-space: pre;
        visibility: hidden;
      }

      :deep(.el-input__wrapper) {
        position: absolute;
        inset: 0;
        padding: 0 5px;
        background: transparent;
        box-shadow: none;
        &:hover { background: var(--el-fill-color-light); }
        &.is-focus { box-shadow: 0 0 0 1px var(--el-color-primary) inset; }
      }

      :deep(.el-input__inner) { color: var(--el-text-color-secondary); text-overflow: ellipsis; }
    }

    .canvasTrigger {
      flex: 0 1 auto;
      min-width: 44px;
      height: 32px;
      margin: 0;
      padding: 0 4px;
      font-size: 13px;
      :deep(> span) { display: flex; align-items: center; gap: 5px; min-width: 0; }

      .triggerName { min-width: 0; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
      .triggerArrow { flex-shrink: 0; color: var(--el-text-color-secondary); }
      .triggerKey {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        height: 18px;
        margin-left: 3px;
        padding: 0 4px;
        border: 1px solid var(--el-border-color);
        border-radius: var(--ui-radius-small);
        color: var(--el-text-color-secondary);
        font-family: inherit;
        font-size: 11px;
        line-height: 1;
      }
    }
  }
}

@container canvasWorkspace (max-width: 1040px) {
  .balanceMenuPanel.vue-flow__panel {
    top: 42px;
    max-width: calc(100% - 30px);
  }
  .canvasMenu .menuContent {
    .workspaceNameInput { max-width: 120px; }
    .canvasTrigger .triggerKey { display: none; }
  }
}

@container canvasWorkspace (max-width: 760px) {
  .canvasMenuPanel.vue-flow__panel { max-width: calc(100% - 170px); }
}

@container canvasWorkspace (max-width: 480px) {
  .canvasMenuPanel.vue-flow__panel {
    --canvasMenuOffset: 42px;
    top: 42px;
    max-width: calc(100% - 30px);
  }
  .canvasMenu { margin-left: 0; }
  .balanceMenuPanel.vue-flow__panel { top: 84px; }
}
</style>
