<template>
  <el-dialog :modelValue="modelValue" class="canvasPickerDialog" width="min(1040px, calc(100vw - 32px))" alignCenter appendToBody destroyOnClose :showClose="false"
    :title="entering ? '选择要进入的画布' : '切换画布'" :closeOnClickModal="!busy" :closeOnPressEscape="!busy"
    @update:modelValue="emit('update:modelValue', $event)" @openAutoFocus="focusSearch">
    <div ref="pickerRoot" class="canvasPicker" @keydown="onKeydown">
      <div class="pickerHeader">
        <div class="pickerTitle">
          <span class="titleText">{{ entering ? "选择要进入的画布" : "切换画布" }}</span>
          <span class="titleProject" :title="directory">{{ projectName }}</span>
        </div>
        <div class="headerActions">
          <el-button type="primary" :icon="IconPlus" :disabled="busy || loading || !!loadError" :title="`新建在${currentFolder ? `“${currentFolder}”` : '根目录'}`" @click="emit('create', currentFolder)">新建画布</el-button>
          <el-dropdown v-if="!entering" trigger="click" :disabled="busy" @command="handleFileCommand">
            <el-button :icon="IconDots" :disabled="busy" aria-label="画布文件操作">更多</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="import" :icon="IconFileImport">导入画布</el-dropdown-item>
                <el-dropdown-item command="export" :icon="IconFileExport" :disabled="!activeId">导出当前画布</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button class="closeButton" text :icon="IconX" :disabled="busy" title="关闭" aria-label="关闭画布选择" @click="emit('update:modelValue', false)" />
        </div>
      </div>
      <div class="pickerToolbar">
        <el-input ref="searchInput" v-model="query" class="searchInput" :prefixIcon="IconSearch" placeholder="搜索画布名称或文件夹" aria-label="搜索画布" clearable />
        <el-radio-group v-model="display" class="viewToggle" aria-label="显示方式">
          <el-radio-button value="grid"><icon-layout-grid :size="16" aria-hidden="true" /><span>卡片</span></el-radio-button>
          <el-radio-button value="list"><icon-list :size="16" aria-hidden="true" /><span>列表</span></el-radio-button>
        </el-radio-group>
      </div>
      <div class="pickerBody">
        <nav class="sideNav" aria-label="画布分类">
          <div class="navGroup">
            <button class="navItem" :class="{ active: isActiveView('recent') }" type="button" @click="setView('recent')">
              <icon-clock class="navIcon" :size="17" aria-hidden="true" /><span class="navLabel">最近打开</span><span class="navCount">{{ recent.length }}</span>
            </button>
            <button class="navItem" :class="{ active: isActiveView('pinned') }" type="button" @click="setView('pinned')">
              <icon-star class="navIcon" :size="17" aria-hidden="true" /><span class="navLabel">常用画布</span><span class="navCount">{{ pinned.length }}</span>
            </button>
            <button class="navItem" :class="{ active: isActiveView('all') }" type="button" @click="setView('all')">
              <icon-stack2 class="navIcon" :size="17" aria-hidden="true" /><span class="navLabel">全部画布</span><span class="navCount">{{ canvases.length }}</span>
            </button>
          </div>
          <div class="navGroup folderGroup">
            <div class="navTitle">
              <span>文件夹</span>
              <el-button v-if="!entering" class="navAction" text :icon="IconFolderPlus" :disabled="busy" title="新建文件夹" aria-label="新建画布文件夹" @click="emit('action', 'createFolder', '')" />
            </div>
            <el-scrollbar maxHeight="280px">
              <button class="navItem" :class="{ active: isActiveView('folder:') }" type="button" @click="setView('folder:')">
                <icon-folder-open class="navIcon" :size="17" aria-hidden="true" /><span class="navLabel">根目录</span><span class="navCount">{{ folderCount("") }}</span>
              </button>
              <div v-for="folder in visibleFolders" :key="folder" class="folderRow" :style="{ paddingLeft: `${Math.min(folder.split('/').length - 1, 4) * 12}px` }">
                <button v-if="hasChildFolders(folder)" class="folderExpand" type="button" :aria-expanded="expandedFolders.includes(folder)" :aria-label="`${expandedFolders.includes(folder) ? '收起' : '展开'} ${folder}`" @click="toggleFolder(folder)">
                  <icon-chevron-down v-if="expandedFolders.includes(folder)" :size="13" /><icon-chevron-right v-else :size="13" />
                </button>
                <span v-else class="folderIndent" />
                <button class="navItem" :class="{ active: isActiveView(`folder:${folder}`) }" type="button" :title="folder"
                  @click="setView(`folder:${folder}`)" @contextmenu="!entering && openMenu($event, 'folder', folder)">
                  <icon-folder class="navIcon" :size="16" aria-hidden="true" /><span class="navLabel">{{ folder.split("/").at(-1) }}</span><span class="navCount">{{ folderCount(folder) }}</span>
                </button>
                <el-button v-if="!entering" class="folderMore" text :icon="IconDots" :disabled="busy" :aria-label="`管理文件夹 ${folder}`" @click="openMenu($event, 'folder', folder)" />
              </div>
            </el-scrollbar>
            <button v-if="emptyFolderCount" class="otherFolders" type="button" :aria-expanded="showOtherFolders" @click="showOtherFolders = !showOtherFolders">
              {{ showOtherFolders ? "收起空文件夹" : `显示空文件夹（${emptyFolderCount}）` }}
            </button>
          </div>
        </nav>
        <section class="pickerContent" :aria-busy="loading">
          <div class="contentHeader">
            <span class="contentTitle" :title="contentTitle">{{ contentTitle }}</span>
            <span class="contentMeta" aria-live="polite">{{ visible.length }} 个画布</span>
            <span class="sortLabel">{{ sortLabel }}</span>
          </div>
          <el-scrollbar v-loading="loading" class="contentScroll" maxHeight="min(460px, calc(100dvh - 260px))">
            <div class="contentInner">
              <div v-if="visible.length && display === 'grid'" ref="grid" class="canvasGrid" role="list" aria-label="画布">
                <article v-for="(canvas, index) in visible" :key="canvas.path" class="canvasCard" :class="{ focused: keyboardNavigating && index === focusedIndex }" role="listitem"
                  @contextmenu="!entering && openMenu($event, 'canvas', canvas.path)">
                  <button class="openCanvas" type="button" :disabled="busy" :aria-label="`${entering ? '进入' : '打开'}画布 ${canvas.name}`" :aria-current="canvas.path === activeId ? 'true' : undefined" @click="select(canvas)" @focus="focusedIndex = index">
                    <span class="cardThumb">
                      <svg v-if="canvas.preview?.rects.length" class="thumbSvg" :viewBox="canvas.preview.viewBox" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                        <rect v-for="(rect, rectIndex) in canvas.preview.rects" :key="rectIndex" :x="rect.x" :y="rect.y" :width="rect.width" :height="rect.height" rx="14"
                          :fill="rect.color ? `color-mix(in srgb, ${rect.color} 24%, var(--el-bg-color-overlay))` : 'none'"
                          :stroke="rect.color || 'var(--el-border-color-darker)'" :stroke-width="rect.color ? 2 : 3" :stroke-dasharray="rect.color ? undefined : '16 10'" stroke-opacity="0.8" vector-effect="non-scaling-stroke" />
                      </svg>
                      <span v-else class="thumbEmpty"><icon-vector :size="30" aria-hidden="true" /><span>{{ canvas.previewError ? "预览不可用" : canvas.preview ? "空画布" : "加载预览…" }}</span></span>
                      <span v-if="canvas.path === activeId" class="currentTag">当前画布</span>
                      <span v-else-if="openIds.includes(canvas.path)" class="openedTag">已打开</span>
                    </span>
                    <span class="cardInfo">
                      <span class="cardName" :title="canvas.name"><template v-for="(part, partIndex) in highlight(canvas.name)" :key="partIndex"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
                      <span class="cardFolder" :title="canvas.folder || '根目录'"><icon-folder :size="13" aria-hidden="true" />{{ canvas.folder || "根目录" }}</span>
                      <span class="cardMeta"><span>{{ canvas.preview ? `${canvas.preview.nodeCount} 个节点` : canvas.previewError ? "预览不可用" : "读取中…" }}</span><span :title="absoluteTime(canvas.mtimeMs)">{{ relativeTime(canvas.mtimeMs) }}</span></span>
                    </span>
                  </button>
                  <div class="cardActions">
                    <button class="pinButton" type="button" :class="{ pinned: pinnedIds.includes(canvas.path) }" :disabled="busy" :aria-pressed="pinnedIds.includes(canvas.path)" :aria-label="`${pinnedIds.includes(canvas.path) ? '取消常用' : '设为常用'} ${canvas.name}`" @click="emit('togglePin', canvas.path)">
                      <icon-star-filled v-if="pinnedIds.includes(canvas.path)" :size="15" aria-hidden="true" /><icon-star v-else :size="15" aria-hidden="true" />{{ pinnedIds.includes(canvas.path) ? "已设常用" : "设为常用" }}
                    </button>
                    <el-button v-if="!entering" class="moreButton" text :icon="IconDots" :disabled="busy" :aria-label="`管理画布 ${canvas.name}`" @click="openMenu($event, 'canvas', canvas.path)">管理</el-button>
                  </div>
                </article>
              </div>
              <div v-else-if="visible.length" class="canvasList" role="list" aria-label="画布">
                <div v-for="(canvas, index) in visible" :key="canvas.path" class="listRow" :class="{ focused: keyboardNavigating && index === focusedIndex }" role="listitem" @contextmenu="!entering && openMenu($event, 'canvas', canvas.path)">
                  <button class="listOpen" type="button" :disabled="busy" :aria-current="canvas.path === activeId ? 'true' : undefined" @click="select(canvas)" @focus="focusedIndex = index">
                    <span class="rowName"><span class="nameText"><template v-for="(part, partIndex) in highlight(canvas.name)" :key="partIndex"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span><span v-if="canvas.path === activeId" class="rowCurrent">当前画布</span><span v-else-if="openIds.includes(canvas.path)" class="rowMuted">已打开</span></span>
                    <span class="rowMuted rowFolder" :title="canvas.folder || '根目录'">{{ canvas.folder || "根目录" }}</span>
                    <span class="rowMuted">{{ canvas.preview ? `${canvas.preview.nodeCount} 个节点` : canvas.previewError ? "预览不可用" : "读取中…" }}</span>
                    <span class="rowMuted" :title="absoluteTime(canvas.mtimeMs)">{{ relativeTime(canvas.mtimeMs) }}</span>
                  </button>
                  <button class="pinButton" type="button" :class="{ pinned: pinnedIds.includes(canvas.path) }" :disabled="busy" :aria-pressed="pinnedIds.includes(canvas.path)" :aria-label="`${pinnedIds.includes(canvas.path) ? '取消常用' : '设为常用'} ${canvas.name}`" @click="emit('togglePin', canvas.path)"><icon-star-filled v-if="pinnedIds.includes(canvas.path)" :size="16" /><icon-star v-else :size="16" /></button>
                  <el-button v-if="!entering" class="moreButton" text :icon="IconDots" :disabled="busy" :aria-label="`管理画布 ${canvas.name}`" @click="openMenu($event, 'canvas', canvas.path)" />
                </div>
              </div>
              <el-empty v-else-if="!loading" class="emptyResult" :imageSize="60" :description="emptyDescription">
                <el-button v-if="loadError" @click="load">重新加载</el-button>
                <el-button v-else-if="view !== 'all' || searchText" @click="setView('all')">查看全部画布</el-button>
                <el-button v-else type="primary" :icon="IconPlus" :disabled="busy" @click="emit('create', currentFolder)">新建画布</el-button>
              </el-empty>
            </div>
          </el-scrollbar>
        </section>
      </div>
      <div class="pickerFooter">
        <span class="footerHint">{{ entering ? "选择一张画布进入项目" : "单击卡片打开画布" }}</span>
        <span class="footerKey"><kbd>↑ ↓</kbd>选择 <kbd>Enter</kbd>打开 <kbd>Esc</kbd>关闭</span>
        <span v-if="shortcut" class="footerKey"><kbd>{{ shortcut }}</kbd>唤起</span>
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
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { t } from "@toonflow/i18n/vue";
import { vLoading, type DropdownInstance, type InputInstance } from "element-plus";
import { IconChevronDown, IconChevronRight, IconClock, IconDots, IconFileExport, IconFileImport, IconFolder, IconFolderOpen, IconFolderPlus, IconLayoutGrid, IconList, IconPlus, IconSearch, IconStack2, IconStar, IconStarFilled, IconVector, IconX } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { listCanvasFiles, type CanvasListing } from "@/pages/workspace/canvasFile";

export type CanvasPickerAction = "rename" | "copy" | "delete" | "move" | "createFolder" | "renameFolder" | "deleteFolder";
type Rect = { x: number; y: number; width: number; height: number; color?: string };
type Preview = { nodeCount: number; rects: Rect[]; viewBox: string };
type PickerCanvas = CanvasListing & { preview?: Preview; previewError?: boolean };

const props = withDefaults(defineProps<{
  modelValue: boolean;
  directory: string;
  projectName?: string;
  activeId?: string;
  openIds?: string[];
  recentIds?: string[];
  pinnedIds?: string[];
  entering?: boolean;
  busy?: boolean;
  shortcut?: string;
}>(), { projectName: "", activeId: "", openIds: () => [], recentIds: () => [], pinnedIds: () => [], entering: false, busy: false, shortcut: "" });
const emit = defineEmits<{
  "update:modelValue": [visible: boolean];
  select: [canvas: { id: string; name: string }];
  create: [folder: string];
  togglePin: [path: string];
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
const keyboardNavigating = ref(false);
const pickerRoot = ref<HTMLElement>();
const expandedFolders = ref<string[]>([]);
const showOtherFolders = ref(false);
const searchInput = ref<InputInstance>();
const grid = ref<HTMLElement>();
const itemMenu = ref<DropdownInstance>();
const menuAnchor = shallowRef({ getBoundingClientRect: () => new DOMRect() });
const menuEntry = shallowRef<{ type: "canvas" | "folder"; path: string }>();
const moving = ref(false);
let controller = new AbortController();
let loadedDirectory = "";

const searchText = computed(() => query.value.trim().toLocaleLowerCase());
const byTime = (list: PickerCanvas[]) => [...list].sort((left, right) => right.mtimeMs - left.mtimeMs);
const recent = computed(() => props.recentIds.map(id => canvases.value.find(canvas => canvas.path === id)).filter(canvas => canvas !== undefined));
const pinned = computed(() => props.pinnedIds.map(id => canvases.value.find(canvas => canvas.path === id)).filter(canvas => canvas !== undefined));
const visible = computed(() => {
  if (searchText.value) {
    const relevance = (canvas: PickerCanvas) => {
      const name = canvas.name.toLocaleLowerCase();
      return name === searchText.value ? 0 : name.startsWith(searchText.value) ? 1 : name.includes(searchText.value) ? 2 : 3;
    };
    return canvases.value.filter(canvas => canvas.path.toLocaleLowerCase().includes(searchText.value))
      .sort((left, right) => relevance(left) - relevance(right) || right.mtimeMs - left.mtimeMs);
  }
  if (view.value === "recent") return recent.value;
  if (view.value === "pinned") return pinned.value;
  if (view.value === "all") return byTime(canvases.value);
  const folder = view.value.slice(7);
  return byTime(canvases.value.filter(canvas => canvas.folder === folder || (folder && canvas.path.startsWith(`${folder}/`))));
});
const currentFolder = computed(() => !searchText.value && view.value.startsWith("folder:") ? view.value.slice(7) : "");
const contentTitle = computed(() => {
  if (searchText.value) return t`搜索结果`;
  if (view.value === "recent") return t`最近打开`;
  if (view.value === "pinned") return t`常用画布`;
  if (view.value === "all") return t`全部画布`;
  return view.value.slice(7) || t`根目录`;
});
const sortLabel = computed(() => searchText.value ? t`按匹配程度` : view.value === "recent" ? t`按打开顺序` : view.value === "pinned" ? t`按收藏顺序` : t`按修改时间`);
const emptyDescription = computed(() => {
  if (loadError.value) return loadError.value;
  if (searchText.value) return t`没有匹配的画布`;
  if (view.value === "recent") return t`还没有打开过画布`;
  if (view.value === "pinned") return t`点击画布上的星标，添加常用画布`;
  return t`这里还没有画布`;
});
const emptyFolderCount = computed(() => folders.value.filter(folder => !hasCanvases(folder)).length);
const visibleFolders = computed(() => folders.value.filter(folder => {
  if (!showOtherFolders.value && !hasCanvases(folder)) return false;
  const parts = folder.split("/");
  return parts.slice(0, -1).every((_, index) => expandedFolders.value.includes(parts.slice(0, index + 1).join("/")));
}));
watch([visible, view], () => {
  focusedIndex.value = Math.max(0, visible.value.findIndex(canvas => canvas.path === props.activeId));
  keyboardNavigating.value = false;
});

function isActiveView(key: string) { return view.value === key && !searchText.value; }
function setView(key: string) { view.value = key; query.value = ""; searchInput.value?.focus(); }
function folderCount(folder: string) { return canvases.value.filter(canvas => canvas.folder === folder || (folder && canvas.path.startsWith(`${folder}/`))).length; }
function hasCanvases(folder: string) { return canvases.value.some(canvas => canvas.path.startsWith(`${folder}/`)); }
function hasChildFolders(folder: string) { return folders.value.some(child => parentFolder(child) === folder && (showOtherFolders.value || hasCanvases(child))); }
function toggleFolder(folder: string) {
  expandedFolders.value = expandedFolders.value.includes(folder) ? expandedFolders.value.filter(path => path !== folder) : [...expandedFolders.value, folder];
}
function parentFolder(path: string) { return path.slice(0, Math.max(0, path.lastIndexOf("/"))); }
function focusSearch() { void nextTick(() => searchInput.value?.focus()); }
function handleFileCommand(command: string) {
  if (props.busy) return;
  if (command === "import") emit("import");
  else if (command === "export" && props.activeId) emit("export");
}
function absoluteTime(time: number) { return time ? new Date(time).toLocaleString() : ""; }
function relativeTime(time: number) {
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (!time) return "";
  if (minutes < 1) return t`刚刚修改`;
  if (minutes < 60) return t`${minutes} 分钟前`;
  if (minutes < 24 * 60) return t`${Math.floor(minutes / 60)} 小时前`;
  if (minutes < 30 * 24 * 60) return t`${Math.floor(minutes / 60 / 24)} 天前`;
  return new Date(time).toLocaleDateString();
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
  const refreshing = loadedDirectory === directory;
  if (!refreshing) {
    canvases.value = [];
    folders.value = [];
    expandedFolders.value = [];
    showOtherFolders.value = false;
  }
  const files = useWorkspaceFiles(directory);
  loading.value = true;
  loadError.value = "";
  try {
    const listed = await listCanvasFiles(files, signal);
    if (signal.aborted) return;
    canvases.value = listed.canvases.map(canvas => ({ ...canvas, preview: previewCache.get(`${directory}|${canvas.path}|${canvas.mtimeMs}`) }));
    const addedFolders = listed.folders.filter(folder => !folders.value.includes(folder));
    if (refreshing && addedFolders.some(folder => !listed.canvases.some(canvas => canvas.path.startsWith(`${folder}/`)))) {
      showOtherFolders.value = true;
      for (const folder of addedFolders) {
        const parts = folder.split("/");
        for (let depth = 1; depth < parts.length; depth++) {
          const parent = parts.slice(0, depth).join("/");
          if (!expandedFolders.value.includes(parent)) expandedFolders.value.push(parent);
        }
      }
    }
    loadedDirectory = directory;
    if (view.value === "recent" && !recent.value.length) view.value = "all";
    folders.value = listed.folders;
    if (view.value.startsWith("folder:") && view.value !== "folder:" && !listed.folders.includes(view.value.slice(7))) view.value = "all";
  } catch (error) {
    if (signal.aborted) return;
    canvases.value = [];
    folders.value = [];
    loadError.value = error instanceof Error ? error.message : t`读取画布失败`;
    return;
  } finally { if (!signal.aborted) loading.value = false; }
  const pending = canvases.value.filter(canvas => !canvas.preview);
  const readNext = async (): Promise<void> => {
    const canvas = pending.shift();
    if (!canvas || signal.aborted) return;
    try {
      const data = await files.readJson<{ nodes?: unknown }>(canvas.path, signal);
      if (signal.aborted) return;
      canvas.preview = createPreview(data?.nodes);
      previewCache.set(`${directory}|${canvas.path}|${canvas.mtimeMs}`, canvas.preview);
    } catch {
      if (signal.aborted) return;
      canvas.previewError = true;
    }
    return readNext();
  };
  await Promise.all(Array.from({ length: 4 }, readNext));
}

// 首页按需挂载时弹窗一出现就是打开状态，不依赖 el-dialog 的 open 事件加载。
watch([() => props.modelValue, () => props.directory], ([opened]) => {
  if (opened) {
    query.value = "";
    view.value = props.recentIds.length ? "recent" : "all";
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
  if (event.isComposing || props.busy || !(event.target instanceof HTMLElement)) return;
  const input = event.target instanceof HTMLInputElement && !!event.target.closest(".searchInput");
  if (!input && !event.target.closest(".openCanvas, .listOpen")) return;
  const count = visible.value.length;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() }[event.key];
  if (step && count) {
    if ((display.value === "list" || input) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;
    event.preventDefault();
    keyboardNavigating.value = true;
    focusedIndex.value = Math.min(count - 1, Math.max(0, focusedIndex.value + step));
    void nextTick(() => {
      const button = pickerRoot.value?.querySelectorAll<HTMLButtonElement>(".openCanvas, .listOpen")[focusedIndex.value];
      button?.scrollIntoView({ block: "nearest" });
      if (!input) button?.focus({ preventScroll: true });
    });
  } else if (event.key === "Enter" && count && input) {
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

onBeforeUnmount(() => controller.abort());

defineExpose({ reload: load });
</script>

<style lang="scss" scoped>
:global(.canvasPickerDialog.el-dialog) {
  --el-dialog-padding-primary: 0;
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 40px);
  padding: 0;
  overflow: hidden;
}
:global(.canvasPickerDialog .el-dialog__header) { display: none; }
:global(.canvasPickerDialog .el-dialog__body) { min-height: 0; padding: 0; }
:global(.canvasActionMenu .deleteAction) { color: var(--el-color-danger); }

.canvasPicker {
  display: flex;
  flex-direction: column;
  color: var(--el-text-color-primary);
  max-height: calc(100dvh - 40px);

  .pickerHeader, .pickerToolbar, .pickerFooter { flex-shrink: 0; }

  button:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
  button:disabled { cursor: not-allowed; }

  .pickerHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding: 20px 20px 14px;

    .pickerTitle {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 10px;
      min-width: 0;
      .titleText { font-size: 18px; font-weight: 600; }
      .titleProject { max-width: 280px; overflow: hidden; color: var(--el-text-color-secondary); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    }
    .headerActions {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      gap: 8px;
      .el-button + .el-button { margin-left: 0; }
      .closeButton { width: 32px; height: 32px; padding: 0; }
    }
  }

  .pickerToolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px 16px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    .searchInput { flex: 1; min-width: 0; }
    .viewToggle {
      flex-shrink: 0;
      :deep(.el-radio-button__inner) { display: flex; align-items: center; gap: 6px; }
    }
  }

  .pickerBody { display: grid; grid-template-columns: 188px minmax(0, 1fr); flex: 0 1 auto; min-height: 0; overflow: auto; }
  .sideNav {
    min-width: 0;
    padding: 12px 8px;
    border-right: 1px solid var(--el-border-color-lighter);
    .navGroup + .navGroup { margin-top: 20px; }
    .navTitle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 28px;
      padding: 0 8px;
      margin-bottom: 4px;
      color: var(--el-text-color-secondary);
      font-size: 12px;
      .navAction { width: 26px; height: 26px; padding: 0; }
    }
    .navItem {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
      height: 38px;
      padding: 0 10px;
      border: 0;
      border-radius: var(--el-border-radius-base);
      background: transparent;
      color: var(--el-text-color-regular);
      font: inherit;
      font-size: 13px;
      text-align: start;
      cursor: pointer;
      &:hover { background: var(--el-fill-color-light); }
      &.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
      .navIcon { flex-shrink: 0; }
      .navLabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .navCount { flex-shrink: 0; color: var(--el-text-color-secondary); font-size: 12px; }
    }
    .folderRow {
      display: flex;
      align-items: center;
      min-width: 0;
      .folderExpand, .folderIndent { display: flex; align-items: center; justify-content: center; flex: 0 0 16px; width: 16px; }
      .folderExpand { height: 32px; border: 0; padding: 0; color: var(--el-text-color-secondary); background: transparent; cursor: pointer; }
      .navItem { flex: 1; padding: 0 4px; gap: 5px; }
      .folderMore { flex-shrink: 0; width: 24px; height: 28px; padding: 0; margin: 0; }
    }
    .otherFolders { margin: 8px 0 0; padding: 6px 8px; border: 0; background: transparent; color: var(--el-text-color-secondary); font: inherit; font-size: 12px; text-align: start; cursor: pointer; }
  }

  .pickerContent {
    min-width: 0;
    .contentHeader {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 52px;
      padding: 10px 20px;
      box-sizing: border-box;
      .contentTitle { min-width: 0; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; }
      .contentMeta, .sortLabel { color: var(--el-text-color-secondary); font-size: 12px; }
      .sortLabel { margin-left: auto; }
    }
    .contentInner { padding: 0 20px 20px; }
    .emptyResult { padding: 24px 0; }

    .canvasGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr));
      gap: 16px;
      .canvasCard {
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow: hidden;
        border: 1px solid var(--el-border-color);
        border-radius: var(--ui-radius-large);
        background: var(--el-bg-color-overlay);
        &:hover { border-color: var(--el-color-primary-light-5); }
        &.focused { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
        .openCanvas { display: flex; flex-direction: column; width: 100%; padding: 0; border: 0; color: inherit; background: transparent; font: inherit; text-align: start; cursor: pointer; }
        .cardThumb {
          display: block;
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: var(--el-fill-color-lighter);
          border-bottom: 1px solid var(--el-border-color-lighter);
          .thumbSvg { display: block; width: 100%; height: 100%; padding: 16px; box-sizing: border-box; }
          .thumbEmpty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 100%; color: var(--el-text-color-secondary); font-size: 12px; }
          .currentTag, .openedTag { position: absolute; top: 10px; left: 10px; padding: 3px 8px; border-radius: 5px; font-size: 12px; line-height: 1.5; }
          .currentTag { background: var(--el-color-primary); color: var(--el-color-white); }
          .openedTag { background: var(--el-bg-color-overlay); color: var(--el-text-color-regular); }
        }
        .cardInfo {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          box-sizing: border-box;
          padding: 14px 14px 10px;
          .cardName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 600; line-height: 1.5; }
          .cardFolder { display: flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--el-text-color-secondary); font-size: 12px; svg { flex-shrink: 0; } }
          .cardMeta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
        }
        .cardActions { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 10px 8px; }
      }
    }
    .canvasList {
      display: flex;
      flex-direction: column;
      gap: 4px;
      .listRow {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        border-radius: var(--el-border-radius-base);
        &:hover { background: var(--el-fill-color-light); }
        &.focused { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
        .listOpen { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(60px, 110px) 76px 88px; align-items: center; gap: 12px; flex: 1; min-width: 0; padding: 12px 8px; border: 0; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
        .rowName { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; font-size: 14px; }
        .nameText { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rowCurrent { flex-shrink: 0; color: var(--el-color-primary); font-size: 12px; }
        .rowMuted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--el-text-color-secondary); font-size: 12px; }
      }
    }
    .pinButton { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; min-height: 30px; padding: 4px; border: 0; border-radius: 4px; color: var(--el-text-color-secondary); background: transparent; font: inherit; font-size: 12px; cursor: pointer; &.pinned { color: var(--el-color-primary); } &:hover { background: var(--el-fill-color-light); } }
    .moreButton { flex-shrink: 0; height: 30px; padding: 0 6px; margin: 0; font-size: 12px; }
    mark { border-radius: 2px; background: var(--el-color-primary-light-8); color: var(--el-color-primary); }
  }

  .pickerFooter {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 16px;
    padding: 10px 20px;
    border-top: 1px solid var(--el-border-color-lighter);
    color: var(--el-text-color-secondary);
    font-size: 12px;
    .footerHint { margin-right: auto; }
    .footerKey { display: flex; align-items: center; gap: 5px; }
    kbd { display: inline-flex; align-items: center; padding: 0 4px; border: 1px solid var(--el-border-color); border-radius: 4px; font: inherit; font-size: 11px; line-height: 18px; }
  }

  @media (max-width: 720px) {
    .pickerHeader { padding: 14px 12px 12px; .pickerTitle .titleProject { max-width: 180px; } }
    .pickerToolbar { padding: 0 12px 12px; gap: 8px; }
    .pickerBody { grid-template-columns: 150px minmax(0, 1fr); }
    .sideNav { padding: 8px 4px; }
    .pickerContent {
      .contentHeader { padding-inline: 12px; .sortLabel { display: none; } }
      .contentInner { padding-inline: 12px; }
      .canvasList .listRow .listOpen { grid-template-columns: 1fr; gap: 4px; }
    }
    .pickerFooter { padding-inline: 12px; }
  }
  @media (max-width: 480px) {
    .pickerHeader { .pickerTitle { width: 100%; } .headerActions { width: 100%; .closeButton { margin-left: auto; } } }
    .pickerToolbar { flex-wrap: wrap; .searchInput { flex-basis: 100%; } }
    .pickerBody { grid-template-columns: 112px minmax(0, 1fr); }
    .sideNav {
      .navItem { gap: 4px; padding: 0 4px; font-size: 12px; .navCount { font-size: 11px; } }
      .folderRow { flex-wrap: wrap; .folderMore { margin-left: auto; } }
    }
    .pickerContent .canvasGrid .canvasCard .cardInfo { padding: 10px 8px; }
    .pickerContent .canvasGrid .canvasCard .cardActions { flex-wrap: wrap; padding: 0 4px 6px; }
    .pickerFooter .footerKey { display: none; }
  }
}
</style>
