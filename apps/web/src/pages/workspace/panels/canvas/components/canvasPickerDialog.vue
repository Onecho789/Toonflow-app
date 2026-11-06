<template>
  <el-dialog :modelValue="modelValue" class="canvasPickerDialog" width="min(980px, calc(100vw - 48px))" alignCenter appendToBody destroyOnClose :showClose="false"
    @update:modelValue="emit('update:modelValue', $event)" @openAutoFocus="focusSearch">
    <div class="canvasPicker" role="group" aria-labelledby="canvasPickerTitle" @keydown="onKeydown">
      <div class="pickerHeader">
        <div class="pickerTitle">
          <span id="canvasPickerTitle" class="titleText">{{ entering ? "选择要进入的画布" : "切换画布" }}</span>
          <span class="titleProject" :title="directory">{{ projectName }}</span>
        </div>
        <el-input ref="searchInput" v-model="query" class="searchInput" :prefixIcon="IconSearch" placeholder="搜索画布名称或文件夹" aria-label="搜索画布" clearable />
        <el-radio-group v-model="display" class="viewToggle" aria-label="显示方式">
          <el-radio-button value="grid" title="卡片" aria-label="卡片视图"><icon-layout-grid :size="16" /></el-radio-button>
          <el-radio-button value="list" title="列表" aria-label="列表视图"><icon-list :size="16" /></el-radio-button>
        </el-radio-group>
        <div v-if="!entering" class="headerActions">
          <el-button class="iconButton" :icon="IconFileImport" :disabled="busy" title="导入画布 JSON" aria-label="导入画布 JSON" @click="emit('import')" />
          <el-button class="iconButton" :icon="IconFileExport" :disabled="busy || !activeId" title="导出当前画布 JSON" aria-label="导出当前画布 JSON" @click="emit('export')" />
          <el-button type="primary" :icon="IconPlus" :disabled="busy" :title="`新建在${currentFolder ? `“${currentFolder}”` : '根目录'}`" @click="emit('create', currentFolder)">新建画布</el-button>
        </div>
      </div>
      <div class="pickerBody">
        <nav class="sideNav" aria-label="画布分类">
          <div class="navGroup">
            <button class="navItem" :class="{ active: isActiveView('recent') }" type="button" @click="setView('recent')">
              <icon-clock class="navIcon" :size="16" aria-hidden="true" /><span class="navLabel">最近打开</span>
            </button>
            <button class="navItem" :class="{ active: isActiveView('all') }" type="button" @click="setView('all')">
              <icon-stack2 class="navIcon" :size="16" aria-hidden="true" /><span class="navLabel">全部画布</span><span class="navCount">{{ canvases.length }}</span>
            </button>
          </div>
          <div v-if="folders.length || !entering" class="navGroup">
            <div class="navTitle">
              <span>文件夹</span>
              <el-button v-if="!entering" class="navAction" text :icon="IconFolderPlus" :disabled="busy" title="新建文件夹" aria-label="新建画布文件夹" @click="emit('action', 'createFolder', '')" />
            </div>
            <el-scrollbar maxHeight="calc(100% - 26px)">
              <button class="navItem" :class="{ active: isActiveView('folder:') }" type="button" @click="setView('folder:')">
                <icon-folder-open class="navIcon" :size="16" aria-hidden="true" /><span class="navLabel">根目录</span><span class="navCount">{{ folderCount("") }}</span>
              </button>
              <div v-for="folder in folders" :key="folder" class="navItem folderItem" :class="{ active: isActiveView(`folder:${folder}`) }"
                :style="{ paddingLeft: `${10 + 12 * (folder.split('/').length - 1)}px` }" role="button" tabindex="0" :title="folder"
                @click="setView(`folder:${folder}`)" @keydown.enter.self.prevent="setView(`folder:${folder}`)" @contextmenu="!entering && openMenu($event, 'folder', folder)">
                <icon-folder class="navIcon" :size="16" aria-hidden="true" /><span class="navLabel">{{ folder.split("/").at(-1) }}</span>
                <span class="navCount">{{ folderCount(folder) }}</span>
                <el-button v-if="!entering" class="moreButton" text :icon="IconDots" :disabled="busy" title="更多" :aria-label="`更多 ${folder}`" @click.stop="openMenu($event, 'folder', folder)" />
              </div>
            </el-scrollbar>
          </div>
        </nav>
        <section class="pickerContent" aria-live="polite">
          <div class="contentHeader">
            <span class="contentTitle">{{ contentTitle }}</span>
            <span class="contentMeta">{{ visible.length }} 个画布{{ view === "recent" && !searchText ? "" : " · 按修改时间" }}</span>
          </div>
          <el-scrollbar v-loading="loading" class="contentScroll">
            <div class="contentInner">
              <div v-if="visible.length && display === 'grid'" ref="grid" class="canvasGrid" role="listbox" aria-label="画布">
                <div v-for="(canvas, index) in visible" :key="canvas.path" class="canvasCard" :class="{ focused: index === focusedIndex }" role="option"
                  :aria-selected="index === focusedIndex" :title="canvas.path" @click="select(canvas)" @mouseenter="focusedIndex = index" @contextmenu="!entering && openMenu($event, 'canvas', canvas.path)">
                  <div class="cardThumb">
                    <svg v-if="canvas.preview?.rects.length" class="thumbSvg" :viewBox="canvas.preview.viewBox" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                      <rect v-for="(rect, rectIndex) in canvas.preview.rects" :key="rectIndex" :x="rect.x" :y="rect.y" :width="rect.width" :height="rect.height" rx="14"
                        :fill="rect.color ? `color-mix(in srgb, ${rect.color} 32%, var(--el-bg-color-overlay))` : 'none'"
                        :stroke="rect.color || 'var(--el-border-color-darker)'" :stroke-width="rect.color ? 3 : 4" :stroke-dasharray="rect.color ? undefined : '16 10'" stroke-opacity="0.7"
                        vector-effect="non-scaling-stroke" />
                    </svg>
                    <div v-else class="thumbEmpty"><icon-vector :size="28" aria-hidden="true" /><span>{{ canvas.preview ? "空画布" : "" }}</span></div>
                    <el-tag v-if="canvas.path === activeId" class="currentTag" size="small" effect="dark" round>当前</el-tag>
                    <el-button v-if="!entering" class="moreButton" text :icon="IconDots" :disabled="busy" title="更多" :aria-label="`更多 ${canvas.name}`" @click.stop="openMenu($event, 'canvas', canvas.path)" />
                  </div>
                  <div class="cardInfo">
                    <div class="cardName">
                      <icon-check v-if="canvas.path === activeId" class="currentIcon" :size="14" aria-label="当前画布" />
                      <icon-vector v-else class="canvasIcon" :size="14" aria-hidden="true" />
                      <span class="nameText"><template v-for="(part, partIndex) in highlight(canvas.name)" :key="partIndex"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
                      <span v-if="openIds.includes(canvas.path) && canvas.path !== activeId" class="openDot" title="已在后台打开，切换无需重新加载" />
                    </div>
                    <div class="cardMeta">{{ canvasMeta(canvas) }}</div>
                  </div>
                </div>
              </div>
              <div v-else-if="visible.length" class="canvasList" role="listbox" aria-label="画布">
                <div class="listRow listHead" aria-hidden="true"><span>名称</span><span>位置</span><span>节点</span><span>修改时间</span><span /></div>
                <div v-for="(canvas, index) in visible" :key="canvas.path" class="listRow" :class="{ focused: index === focusedIndex }" role="option"
                  :aria-selected="index === focusedIndex" :title="canvas.path" @click="select(canvas)" @mouseenter="focusedIndex = index" @contextmenu="!entering && openMenu($event, 'canvas', canvas.path)">
                  <span class="rowName">
                    <icon-check v-if="canvas.path === activeId" class="currentIcon" :size="14" aria-label="当前画布" />
                    <icon-vector v-else class="canvasIcon" :size="14" aria-hidden="true" />
                    <span class="nameText"><template v-for="(part, partIndex) in highlight(canvas.name)" :key="partIndex"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
                    <span v-if="openIds.includes(canvas.path) && canvas.path !== activeId" class="openDot" title="已在后台打开，切换无需重新加载" />
                  </span>
                  <span class="rowMuted">{{ canvas.folder || "根目录" }}</span>
                  <span class="rowMuted">{{ canvas.preview?.nodeCount ?? "" }}</span>
                  <span class="rowMuted">{{ relativeTime(canvas.mtimeMs) }}</span>
                  <el-button v-if="!entering" class="moreButton" text :icon="IconDots" :disabled="busy" title="更多" :aria-label="`更多 ${canvas.name}`" @click.stop="openMenu($event, 'canvas', canvas.path)" />
                </div>
              </div>
              <el-empty v-else-if="!loading" class="emptyResult" :imageSize="72" :description="loadError || (searchText ? '没有匹配的画布' : '这里还没有画布')" />
            </div>
          </el-scrollbar>
        </section>
      </div>
      <div class="pickerFooter">
        <span class="footerKey"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>选择</span>
        <span class="footerKey"><kbd>Enter</kbd>打开</span>
        <span class="footerKey"><kbd>Esc</kbd>关闭</span>
        <span v-if="shortcut" class="footerKey"><kbd>{{ shortcut }}</kbd>随时唤起</span>
      </div>
    </div>
  </el-dialog>
  <el-dropdown ref="itemMenu" trigger="contextmenu" virtualTriggering :virtualRef="menuAnchor" placement="bottom-end" :showArrow="false" :hideOnClick="false" popperClass="canvasActionMenu"
    @command="handleCommand" @visibleChange="(opened: boolean) => { if (!opened) moving = false; }">
    <template #dropdown>
      <el-dropdown-menu v-if="menuEntry?.type === 'canvas' && moving">
        <el-dropdown-item command="moveNew" :icon="IconFolderPlus">新建文件夹…</el-dropdown-item>
        <el-dropdown-item v-for="folder in ['', ...folders]" :key="folder" :command="`moveTo:${folder}`" :icon="IconFolder" :disabled="folder === parentFolder(menuEntry.path)">
          {{ folder || "画布根目录" }}
        </el-dropdown-item>
      </el-dropdown-menu>
      <el-dropdown-menu v-else-if="menuEntry?.type === 'canvas'">
        <el-dropdown-item command="rename">重命名</el-dropdown-item>
        <el-dropdown-item command="move">移动到…</el-dropdown-item>
        <el-dropdown-item command="copy">创建副本</el-dropdown-item>
        <el-dropdown-item class="deleteAction" command="delete" divided>删除</el-dropdown-item>
      </el-dropdown-menu>
      <el-dropdown-menu v-else-if="menuEntry">
        <el-dropdown-item command="renameFolder">重命名</el-dropdown-item>
        <el-dropdown-item class="deleteAction" command="deleteFolder" :disabled="hasCanvases(menuEntry.path)" :title="hasCanvases(menuEntry.path) ? '请先移出或删除文件夹内的画布' : undefined">删除</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { t } from "@toonflow/i18n/vue";
import { vLoading, type DropdownInstance, type InputInstance } from "element-plus";
import { IconCheck, IconClock, IconDots, IconFileExport, IconFileImport, IconFolder, IconFolderOpen, IconFolderPlus, IconLayoutGrid, IconList, IconPlus, IconSearch, IconStack2, IconVector } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { listCanvasFiles, type CanvasListing } from "@/pages/workspace/canvasFile";

export type CanvasPickerAction = "rename" | "copy" | "delete" | "move" | "createFolder" | "renameFolder" | "deleteFolder";
type Rect = { x: number; y: number; width: number; height: number; color?: string };
type Preview = { nodeCount: number; rects: Rect[]; viewBox: string };
type PickerCanvas = CanvasListing & { preview?: Preview };

const props = withDefaults(defineProps<{
  modelValue: boolean;
  directory: string;
  projectName?: string;
  activeId?: string;
  openIds?: string[];
  recentIds?: string[];
  entering?: boolean;
  busy?: boolean;
  shortcut?: string;
}>(), { projectName: "", activeId: "", openIds: () => [], recentIds: () => [], entering: false, busy: false, shortcut: "" });
const emit = defineEmits<{
  "update:modelValue": [visible: boolean];
  select: [canvas: { id: string; name: string }];
  create: [folder: string];
  import: [];
  export: [];
  action: [command: CanvasPickerAction, path: string, target?: string];
}>();

// ACT: 缩略图按文件修改时间缓存在内存，重复打开弹窗不再读取未变化的画布。
const previewCache = new Map<string, Preview>();
const canvases = ref<PickerCanvas[]>([]);
const folders = shallowRef<string[]>([]);
const loading = ref(false);
const loadError = ref("");
const view = ref("all");
const display = ref<"grid" | "list">("grid");
const query = ref("");
const focusedIndex = ref(0);
const searchInput = ref<InputInstance>();
const grid = ref<HTMLElement>();
const itemMenu = ref<DropdownInstance>();
const menuAnchor = shallowRef({ getBoundingClientRect: () => new DOMRect() });
const menuEntry = shallowRef<{ type: "canvas" | "folder"; path: string }>();
const moving = ref(false);
let controller = new AbortController();

const searchText = computed(() => query.value.trim().toLocaleLowerCase());
const byTime = (list: PickerCanvas[]) => [...list].sort((left, right) => right.mtimeMs - left.mtimeMs);
const recent = computed(() => {
  const remembered = props.recentIds.map(id => canvases.value.find(canvas => canvas.path === id)).filter(canvas => canvas !== undefined);
  // 记录不足时按修改时间补齐，避免刚开始使用时“最近打开”只有一两个。
  const rest = byTime(canvases.value.filter(canvas => !remembered.includes(canvas)));
  return [...remembered, ...rest].slice(0, 8);
});
const visible = computed(() => {
  if (searchText.value) return byTime(canvases.value.filter(canvas => canvas.path.toLocaleLowerCase().includes(searchText.value)));
  if (view.value === "recent") return recent.value;
  if (view.value === "all") return byTime(canvases.value);
  return byTime(canvases.value.filter(canvas => canvas.folder === view.value.slice(7)));
});
const currentFolder = computed(() => !searchText.value && view.value.startsWith("folder:") ? view.value.slice(7) : "");
const contentTitle = computed(() => {
  if (searchText.value) return t`搜索结果`;
  if (view.value === "recent") return t`最近打开`;
  if (view.value === "all") return t`全部画布`;
  return view.value.slice(7) || t`根目录`;
});
watch([visible, view], () => { focusedIndex.value = Math.max(0, visible.value.findIndex(canvas => canvas.path === props.activeId)); });

function isActiveView(key: string) { return view.value === key && !searchText.value; }
function setView(key: string) { view.value = key; query.value = ""; searchInput.value?.focus(); }
function folderCount(folder: string) { return canvases.value.filter(canvas => canvas.folder === folder).length; }
function hasCanvases(folder: string) { return canvases.value.some(canvas => canvas.path.startsWith(`${folder}/`)); }
function parentFolder(path: string) { return path.slice(0, Math.max(0, path.lastIndexOf("/"))); }
function focusSearch() { setTimeout(() => searchInput.value?.focus()); }

function relativeTime(time: number) {
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (!time) return "";
  if (minutes < 1) return t`刚刚`;
  if (minutes < 60) return t`${minutes} 分钟前`;
  if (minutes < 24 * 60) return t`${Math.floor(minutes / 60)} 小时前`;
  if (minutes < 30 * 24 * 60) return t`${Math.floor(minutes / 60 / 24)} 天前`;
  return new Date(time).toLocaleDateString();
}

function canvasMeta(canvas: PickerCanvas) {
  const nodes = canvas.preview ? canvas.preview.nodeCount ? t`${canvas.preview.nodeCount} 个节点` : t`空画布` : "";
  return [canvas.folder || t`根目录`, nodes, relativeTime(canvas.mtimeMs)].filter(Boolean).join(" · ");
}

function highlight(text: string) {
  const index = searchText.value ? text.toLocaleLowerCase().indexOf(searchText.value) : -1;
  if (index < 0) return [{ text, match: false }];
  const end = index + searchText.value.length;
  return [{ text: text.slice(0, index), match: false }, { text: text.slice(index, end), match: true }, { text: text.slice(end), match: false }];
}

function nodeColor(type: string) {
  if (type === "canvasGroup") return undefined;
  if (/video/i.test(type)) return "#e6a23c";
  if (/audio|music|voice/i.test(type)) return "#67c23a";
  if (/image/i.test(type)) return "#409eff";
  return "#909399";
}

function readSize(value: unknown, fallback: number) {
  const size = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(size) && size > 0 ? size : fallback;
}

/** 按节点保存的位置与尺寸绘制示意块，不截图、不额外写文件。 */
function createPreview(nodes: unknown): Preview {
  const list = Array.isArray(nodes) ? nodes.filter(node => node && typeof node.id === "string" && node.position) : [];
  const byId = new Map(list.map(node => [node.id as string, node]));
  const absolute = (node: { position: { x: number; y: number }; parentNode?: string }, depth = 0): { x: number; y: number } => {
    const parent = node.parentNode ? byId.get(node.parentNode) : undefined;
    if (!parent || depth > 8) return { x: Number(node.position.x) || 0, y: Number(node.position.y) || 0 };
    const offset = absolute(parent, depth + 1);
    return { x: offset.x + (Number(node.position.x) || 0), y: offset.y + (Number(node.position.y) || 0) };
  };
  // ACT: 节点过多时只画前 300 个，示意布局即可。
  const rects = list.slice(0, 300).map(node => {
    const { x, y } = absolute(node);
    const group = node.type === "canvasGroup";
    return { x, y, width: readSize(node.style?.width ?? node.width, group ? 480 : 220), height: readSize(node.style?.height ?? node.height, group ? 320 : 128), color: nodeColor(String(node.type)) };
  });
  if (!rects.length) return { nodeCount: list.length, rects, viewBox: "0 0 1 1" };
  const minX = Math.min(...rects.map(rect => rect.x)) - 40;
  const minY = Math.min(...rects.map(rect => rect.y)) - 40;
  const maxX = Math.max(...rects.map(rect => rect.x + rect.width)) + 40;
  const maxY = Math.max(...rects.map(rect => rect.y + rect.height)) + 40;
  return { nodeCount: list.length, rects, viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}` };
}

async function load() {
  controller.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const directory = props.directory;
  const files = useWorkspaceFiles(directory);
  loading.value = true;
  loadError.value = "";
  try {
    const listed = await listCanvasFiles(files, signal);
    canvases.value = listed.canvases.map(canvas => ({ ...canvas, preview: previewCache.get(`${directory}|${canvas.path}|${canvas.mtimeMs}`) }));
    folders.value = listed.folders;
    if (view.value.startsWith("folder:") && view.value !== "folder:" && !listed.folders.includes(view.value.slice(7))) view.value = "all";
  } catch (error) {
    if (signal.aborted) return;
    loadError.value = error instanceof Error ? error.message : t`读取画布失败`;
    return;
  } finally { if (!signal.aborted) loading.value = false; }
  const pending = canvases.value.filter(canvas => !canvas.preview);
  const readNext = async (): Promise<void> => {
    const canvas = pending.shift();
    if (!canvas || signal.aborted) return;
    const data = await files.readJson<{ nodes?: unknown }>(canvas.path, signal).catch(() => undefined);
    if (signal.aborted) return;
    canvas.preview = createPreview(data?.nodes);
    previewCache.set(`${directory}|${canvas.path}|${canvas.mtimeMs}`, canvas.preview);
    return readNext();
  };
  await Promise.all(Array.from({ length: 4 }, readNext));
}

// 首页按需挂载时弹窗一出现就是打开状态，不依赖 el-dialog 的 open 事件加载。
watch([() => props.modelValue, () => props.directory], ([opened]) => {
  if (opened) {
    query.value = "";
    view.value = props.entering || props.recentIds.length ? "recent" : "all";
    void load();
  } else { controller.abort(); itemMenu.value?.handleClose(); }
}, { immediate: true });

function select(canvas: PickerCanvas) {
  if (!props.busy) emit("select", { id: canvas.path, name: canvas.name });
}

function columns() {
  if (display.value === "list" || !grid.value) return 1;
  return getComputedStyle(grid.value).gridTemplateColumns.split(" ").length;
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  const count = visible.value.length;
  const input = event.target instanceof HTMLInputElement;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() }[event.key];
  if (step && count) {
    if ((display.value === "list" || input) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;
    event.preventDefault();
    focusedIndex.value = Math.min(count - 1, Math.max(0, focusedIndex.value + step));
    void nextTick(() => document.querySelector(".canvasPickerDialog .focused")?.scrollIntoView({ block: "nearest" }));
  } else if (event.key === "Enter" && count && (input || !(event.target instanceof HTMLButtonElement))) {
    event.preventDefault();
    select(visible.value[focusedIndex.value]!);
  }
}

function openMenu(event: MouseEvent, type: "canvas" | "folder", path: string) {
  event.preventDefault();
  if (props.busy) return;
  itemMenu.value?.handleClose();
  menuEntry.value = { type, path };
  moving.value = false;
  const rect = event.type === "contextmenu" ? new DOMRect(event.clientX, event.clientY, 0, 0) : (event.currentTarget as HTMLElement).getBoundingClientRect();
  menuAnchor.value = { getBoundingClientRect: () => rect };
  void nextTick(() => itemMenu.value?.handleOpen());
}

function handleCommand(command: string) {
  const entry = menuEntry.value;
  if (!entry || props.busy) return;
  if (command === "move") { moving.value = true; return; }
  itemMenu.value?.handleClose();
  if (command === "moveNew") emit("action", "move", entry.path);
  else if (command.startsWith("moveTo:")) emit("action", "move", entry.path, command.slice(7));
  else emit("action", command as CanvasPickerAction, entry.path);
}

defineExpose({ reload: load });
</script>

<style lang="scss" scoped>
:global(.canvasPickerDialog.el-dialog) {
  --el-dialog-padding-primary: 0;
  display: flex;
  flex-direction: column;
  height: min(640px, calc(100dvh - 64px));
  padding: 0;
  overflow: hidden;
}

:global(.canvasPickerDialog .el-dialog__header) { display: none; }
:global(.canvasPickerDialog .el-dialog__body) { flex: 1; min-height: 0; padding: 0; }
:global(.canvasActionMenu .deleteAction) { color: var(--el-color-danger); }

kbd {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 5px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--ui-radius-small);
  color: var(--el-text-color-secondary);
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
}

.canvasPicker {
  display: flex;
  flex-direction: column;
  height: 100%;

  .pickerHeader {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    .pickerTitle {
      display: flex;
      flex-direction: column;
      min-width: 0;
      margin-right: 8px;

      .titleText { font-size: 15px; font-weight: 600; line-height: 1.5; white-space: nowrap; }
      .titleProject { overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    }

    .searchInput { flex: 1; min-width: 160px; max-width: 360px; margin-left: auto; }

    .headerActions {
      display: flex;
      gap: 8px;
      .el-button + .el-button { margin-left: 0; }
      .iconButton { width: 32px; padding: 0; }
    }
  }

  .pickerBody { display: flex; flex: 1; min-height: 0; }

  .sideNav {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 196px;
    padding: 8px;
    border-right: 1px solid var(--el-border-color-lighter);

    .navGroup + .navGroup { flex: 1; min-height: 0; margin-top: 12px; }

    .navTitle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 26px;
      padding: 0 4px 0 10px;
      color: var(--el-text-color-secondary);
      font-size: 12px;

      .navAction { width: 22px; height: 22px; padding: 0; }
    }

    .navItem {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      height: 34px;
      padding: 0 10px;
      border: 0;
      border-radius: var(--el-border-radius-base);
      background: none;
      color: var(--el-text-color-regular);
      font: inherit;
      font-size: 13px;
      text-align: start;
      cursor: pointer;

      &:hover { background: var(--el-fill-color-light); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
      &.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }

      .navIcon { flex-shrink: 0; }
      .navLabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .navCount { flex-shrink: 0; color: var(--el-text-color-placeholder); font-size: 12px; }
      .moreButton { display: none; width: 22px; height: 22px; margin: 0 -4px 0 0; padding: 0; }
    }

    .folderItem {
      &:hover, &:focus-within {
        .navCount { display: none; }
        .moreButton { display: inline-flex; }
      }
    }
  }

  .pickerContent {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;

    .contentHeader {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 16px;

      .contentTitle { font-size: 13px; font-weight: 600; }
      .contentMeta { flex: 1; color: var(--el-text-color-secondary); font-size: 12px; }
    }

    .contentScroll { flex: 1; min-height: 0; }
    .contentInner { padding: 0 16px 16px; }
    .emptyResult { padding: 72px 0; }
  }

  .pickerFooter {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 36px;
    padding: 0 16px;
    border-top: 1px solid var(--el-border-color-lighter);
    color: var(--el-text-color-secondary);
    font-size: 12px;

    .footerKey { display: flex; align-items: center; gap: 4px; }
  }
}

.canvasGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
  gap: 12px;

  .canvasCard {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--ui-radius-large);
    background: var(--el-bg-color-overlay);
    cursor: pointer;
    transition: border-color 0.2s;

    &:hover { border-color: var(--el-color-primary-light-5); .moreButton { opacity: 1; } }
    &.focused { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary); .moreButton { opacity: 1; } }

    .cardThumb {
      position: relative;
      aspect-ratio: 16 / 10;
      border-bottom: 1px solid var(--el-border-color-lighter);
      background: var(--el-fill-color-lighter);

      .thumbSvg { display: block; width: 100%; height: 100%; padding: 10px; }

      .thumbEmpty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 100%;
        color: var(--el-text-color-placeholder);
        font-size: 12px;
      }

      .currentTag { position: absolute; top: 8px; left: 8px; }

      .moreButton {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 26px;
        height: 26px;
        padding: 0;
        opacity: 0;
        @media (hover: none) { opacity: 1; }
      }
    }

    .cardInfo {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px 10px;

      .cardName { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5; }
      .cardMeta { overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
    }

    @media (prefers-reduced-motion: reduce) { transition: none; }
  }
}

.canvasList {
  display: flex;
  flex-direction: column;

  .listRow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 140px 72px 96px 32px;
    align-items: center;
    gap: 12px;
    height: 40px;
    padding: 0 6px 0 10px;
    border-radius: var(--el-border-radius-base);
    font-size: 13px;
    cursor: pointer;

    &:hover { background: var(--el-fill-color-light); .moreButton { opacity: 1; } }
    &.focused { background: var(--el-color-primary-light-9); .moreButton { opacity: 1; } }

    .rowName { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .rowMuted { overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .moreButton { width: 26px; height: 26px; padding: 0; opacity: 0; @media (hover: none) { opacity: 1; } }
  }

  .listHead {
    height: 30px;
    color: var(--el-text-color-placeholder);
    font-size: 12px;
    cursor: default;
    &:hover { background: none; }
  }
}

.nameText {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  mark { border-radius: 2px; background: var(--el-color-primary-light-8); color: var(--el-color-primary); }
}

.canvasIcon { flex-shrink: 0; color: var(--el-text-color-secondary); }
.currentIcon { flex-shrink: 0; color: var(--el-color-primary); }
.openDot { flex-shrink: 0; width: 6px; height: 6px; border-radius: 50%; background: var(--el-color-success); }
</style>
