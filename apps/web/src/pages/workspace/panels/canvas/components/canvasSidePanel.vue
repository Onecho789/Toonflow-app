<template>
  <el-card v-if="!open" class="sidePanelTrigger" shadow="never" :bodyStyle="{ padding: '2px 4px' }">
    <el-button text :icon="IconLayoutSidebarLeftExpand" :disabled="disabled" aria-label="展开画布侧栏" title="展开画布侧栏" @click="open = true">
      画布元素 {{ items.length }}
    </el-button>
  </el-card>
  <el-card v-show="open" class="canvasSidePanel" shadow="never" :bodyStyle="{ padding: '0' }" :style="{ width: `var(--dragWidth, ${width}px)` }" role="region" aria-label="画布侧栏" @dblclick.stop>
    <div class="panelHeader">
      <el-tabs v-model="tab" class="panelTabs">
        <el-tab-pane label="画布" name="nodes" />
        <el-tab-pane label="资产" name="assets" />
        <el-tab-pane label="提示词库" name="prompts" />
      </el-tabs>
      <el-button class="iconButton" text :icon="IconLayoutSidebarLeftCollapse" aria-label="收起画布侧栏" title="收起画布侧栏" @click="open = false" />
    </div>

    <div v-show="tab === 'nodes'" class="nodesPane">
      <div class="paneToolbar">
        <span class="paneTitle">画布元素 {{ items.length }}</span>
        <el-button size="small" :type="selecting ? 'primary' : 'default'" :aria-pressed="selecting" title="开启后点击元素可多选" @click="selecting = !selecting">选择</el-button>
        <el-button v-if="failedCount || failedOnly" size="small" :type="failedOnly ? 'danger' : 'default'" :aria-pressed="failedOnly" title="只显示生成失败的元素" @click="failedOnly = !failedOnly">失败 {{ failedCount }}</el-button>
        <el-select v-model="typeFilter" class="typeFilter" size="small" aria-label="按类型筛选" clearable placeholder="全部类型">
          <el-option v-for="type in types" :key="type" :label="typeLabel(type)" :value="type" />
        </el-select>
      </div>
      <el-input v-model="query" class="searchInput" size="small" :prefixIcon="IconSearch" placeholder="搜索名称、提示词或类型" aria-label="搜索画布元素" clearable @keydown.esc.stop="query = ''" />
      <el-scrollbar class="paneScroll">
        <div class="nodeList" role="list" aria-label="画布元素">
          <div v-for="item in visibleItems" :key="item.node.id" class="nodeItem" :class="{ selected: item.node.selected }" :style="{ paddingLeft: `${item.depth * 16}px` }" role="listitem" @contextmenu.prevent="openItemMenu($event, item)">
            <el-button v-if="item.isGroup && item.childCount" class="iconButton foldButton" text :icon="collapsed.has(item.node.id) ? IconChevronRight : IconChevronDown" :aria-label="collapsed.has(item.node.id) ? '展开分组' : '折叠分组'" :aria-expanded="!collapsed.has(item.node.id)" @click="toggleGroup(item.node.id)" />
            <button class="nodeMain" type="button" :aria-pressed="selecting ? !!item.node.selected : undefined" :title="item.prompt ? `${item.title}\n${item.prompt}` : item.title" aria-keyshortcuts="Delete" @click="clickNode(item.node)" @keydown="deleteByKey($event, item)">
              <mentionThumbnail v-if="item.media" class="nodeThumbnail" :thumbnail="item.media.value" :directory="directory">
                <component :is="typeIcon(item.node.type)" :size="18" />
              </mentionThumbnail>
              <span v-else class="nodeThumbnail"><component :is="typeIcon(item.node.type)" :size="18" /></span>
              <span class="nodeText">
                <span class="nodeTitle">{{ item.title }}</span>
                <span class="nodeType">{{ item.prompt || typeLabel(item.node.type) }}</span>
              </span>
              <span v-if="item.status" class="statusDot" :class="item.status" role="img" :aria-label="statusLabels[item.status]" :title="statusLabels[item.status]" />
            </button>
            <el-button v-if="item.media && item.media.dataType !== 'AUDIO'" class="iconButton" text :icon="IconEye" :aria-label="'预览 ' + item.title" title="预览" @click="openPreview(item)" />
          </div>
          <p v-if="!visibleItems.length" class="empty">{{ items.length ? "没有匹配的元素" : "画布上还没有元素" }}</p>
        </div>
      </el-scrollbar>
      <div v-if="selecting" class="selectionBar">
        <span class="selectionCount">已选 {{ selectedCount }}</span>
        <el-button size="small" text :disabled="disabled || !filteredItems.length" @click="selectAll">全选</el-button>
        <el-button size="small" text :disabled="disabled || !selectedCount" @click="clearSelection">清空</el-button>
        <el-button size="small" text type="danger" :disabled="disabled || !selectedCount" @click="deleteNodes(flow.getSelectedNodes.value)">删除所选</el-button>
        <el-button size="small" type="primary" :disabled="disabled || !selectedCount" @click="emit('exportSelection')">导出所选</el-button>
      </div>
      <div v-if="failedOnly" class="selectionBar">
        <span class="selectionCount">{{ retrying ? `重试中 ${retryDone}/${retryTotal}` : `失败 ${failedCount}` }}</span>
        <el-button v-if="retrying" size="small" text @click="stopRetry">停止排队</el-button>
        <el-button size="small" type="primary" :loading="retrying" :disabled="disabled || retrying || !failedCount" @click="retryFailed">重试全部失败</el-button>
      </div>
      <el-dropdown ref="itemMenu" trigger="contextmenu" virtualTriggering :virtualRef="menuAnchor" placement="bottom-start" :showArrow="false" @command="handleItemCommand">
        <template #dropdown>
          <el-dropdown-menu v-if="menuItem">
            <el-dropdown-item command="locate" :icon="IconFocus2" :disabled="disabled">定位</el-dropdown-item>
            <el-dropdown-item v-if="menuItem.media && menuItem.media.dataType !== 'AUDIO'" command="preview" :icon="IconEye" :disabled="disabled">预览</el-dropdown-item>
            <el-dropdown-item command="rename" :icon="IconPencil" :disabled="disabled">重命名</el-dropdown-item>
            <el-dropdown-item command="delete" :icon="IconTrash" :disabled="disabled || menuItem.node.deletable === false" divided>删除</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div v-show="tab === 'assets'" class="assetsPane"><slot name="assets" /></div>

    <div v-show="tab === 'prompts'" class="promptsPane">
      <el-segmented v-model="promptKind" class="promptKind" :options="promptKinds" size="small" block />
      <template v-if="promptKind !== 'canvas'">
        <div class="paneToolbar">
          <el-input v-model="promptQuery" class="searchInput" size="small" :prefixIcon="IconSearch" placeholder="搜索标题、提示词或标签" aria-label="搜索提示词" clearable @keydown.esc.stop="promptQuery = ''" />
          <el-select v-model="promptTag" class="typeFilter" size="small" aria-label="按标签筛选" clearable filterable placeholder="全部标签">
            <el-option v-for="tag in promptTags" :key="tag" :label="tag" :value="tag" />
          </el-select>
          <el-button class="iconButton" text :icon="IconRefresh" :loading="cloudLoading" aria-label="刷新提示词库" title="刷新提示词库" @click="loadCloudPrompts(true)" />
        </div>
        <el-scrollbar v-loading="cloudLoading" class="paneScroll">
          <p v-if="cloudError" class="empty">{{ cloudError }}</p>
          <p v-else-if="!cloudLoading && !cloudSources.length" class="empty">暂无可用的{{ promptKind === "image" ? "图片" : "视频" }}提示词库</p>
          <div v-for="source in cloudSources" :key="source.id" class="promptSource">
            <button class="sourceHeader" type="button" :aria-expanded="!collapsedSources.has(source.id)" @click="toggleSource(source.id)">
              <component :is="collapsedSources.has(source.id) ? IconChevronRight : IconChevronDown" :size="14" />
              <span class="sourceName">{{ source.name }}</span>
              <span class="sourceCount">{{ source.items.length }}</span>
            </button>
            <div v-if="!collapsedSources.has(source.id)" class="cloudList" role="list" :aria-label="source.name">
              <div v-for="item in source.items.slice(0, sourceLimits[source.id] ?? 30)" :key="item.id" class="cloudItem" role="listitem">
                <button class="cloudMain" type="button" :title="item.title" @click="showDetail(item)">
                  <img v-if="item.coverUrl" class="cloudCover" :src="item.coverUrl" alt="" loading="lazy" referrerpolicy="no-referrer" />
                  <span v-else class="cloudCover"><icon-photo :size="18" /></span>
                  <span class="cloudText">
                    <span class="cloudTitle">{{ item.title }}</span>
                    <span class="cloudSummary">{{ item.description || item.prompt }}</span>
                  </span>
                </button>
                <el-button class="iconButton" text :icon="IconCopy" aria-label="复制提示词" title="复制" @click="copyPrompt(item.prompt)" />
                <el-button class="iconButton" text :icon="IconArrowBarToRight" :disabled="disabled" :aria-label="fillLabel" :title="fillLabel" @click="fillPrompt(item)" />
              </div>
              <el-button v-if="source.items.length > (sourceLimits[source.id] ?? 30)" class="moreButton" size="small" text @click="sourceLimits[source.id] = (sourceLimits[source.id] ?? 30) + 30">
                显示更多（剩余 {{ source.items.length - (sourceLimits[source.id] ?? 30) }}）
              </el-button>
            </div>
          </div>
        </el-scrollbar>
      </template>
      <el-scrollbar v-else class="paneScroll">
        <div class="promptList" role="list" aria-label="画布已用提示词">
          <div v-for="prompt in prompts" :key="prompt.text" class="promptItem" role="listitem">
            <button class="promptText" type="button" title="点击复制提示词" @click="copyPrompt(prompt.text)">{{ prompt.text }}</button>
            <el-button class="iconButton" text :icon="IconFocus2" :aria-label="`定位使用此提示词的 ${prompt.nodes.length} 个节点`" title="定位节点" @click="locateNodes(prompt.nodes)" />
          </div>
          <p v-if="!prompts.length" class="empty">画布上还没有使用过的提示词</p>
        </div>
      </el-scrollbar>
    </div>

    <div class="resizeHandle" role="separator" aria-orientation="vertical" aria-label="调整侧栏宽度" :aria-valuenow="width" :aria-valuemin="minWidth" :aria-valuemax="maxWidth" tabindex="0"
      @pointerdown="startResize" @pointermove="resize" @pointerup="finishResize" @pointercancel="finishResize" @keydown.left.prevent="setWidth(width - 16, true)" @keydown.right.prevent="setWidth(width + 16, true)" />
  </el-card>
  <mediaPreview v-model="previewVisible" v-model:index="previewIndex" :items="previewItems" />
  <promptDetail v-model="detailVisible" :item="detailItem" :fillLabel="fillLabel" :fillDisabled="disabled" @fill="fillPrompt" />
</template>

<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from "vue";
import { useVueFlow, type GraphNode } from "@vue-flow/core";
import {
  ElButton, ElCard, ElDropdown, ElDropdownItem, ElDropdownMenu, ElInput, ElMessage, ElMessageBox, ElOption, ElScrollbar, ElSegmented, ElSelect, ElTabPane, ElTabs, vLoading,
  type DropdownInstance,
} from "element-plus";
import {
  IconArrowBarToRight, IconBoxMultiple, IconChevronDown, IconChevronRight, IconCopy, IconEye, IconFileText, IconFocus2, IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand, IconMusic, IconPencil, IconPhoto, IconRefresh, IconSearch, IconSquare, IconTrash, IconVideo,
} from "@tabler/icons-vue";
import { useNodeToolsContext } from "@toonflow/nodes-scaffold/nodeTools";
import mediaPreview, { type MediaPreviewItem } from "@toonflow/node-shared/mediaPreview";
import promptDetail from "@toonflow/node-shared/promptDetail";
import { promptModelOf, readCloudPrompts, type CloudPromptItem, type CloudPromptSource } from "@toonflow/node-shared/cloudPrompts";
import type { NodeOutput } from "@toonflow/nodes-scaffold/values";
import mentionThumbnail from "@/components/agent/mentionThumbnail.vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { writeClipboardText } from "@/lib/clipboard";

type MediaOutput = Extract<NodeOutput, { dataType: "IMAGE" | "VIDEO" | "AUDIO" }>;
type GenerationStatus = "running" | "succeeded" | "failed";

const props = defineProps<{ directory?: string; nodeOptions: { type: string; label: string }[]; disabled?: boolean }>();
const open = defineModel<boolean>("open", { default: false });
const tab = defineModel<"nodes" | "assets" | "prompts">("tab", { default: "nodes" });
// deleteNodes 交给画布按撤销批次删除，删除完成或失败后再结束 Promise。
// deleteNodes 交给画布按一步撤销删除。
// createNode 交给画布在视口中央新建节点（一步撤销）。
const emit = defineEmits<{ exportSelection: []; deleteNodes: [nodes: GraphNode[]]; createNode: [type: string, data: Record<string, unknown>] }>();
const flow = useVueFlow();
const collapsed = ref(new Set<string>());
const storageKey = "toonflow.canvasSidePanel";
const minWidth = 240;
const maxWidth = 560;
const width = ref(readWidth());
const selecting = ref(false);
const typeFilter = ref("");
const query = ref("");
const previewVisible = ref(false);
const previewItems = ref<MediaPreviewItem[]>([]);
const previewIndex = ref(0);
const statusLabels: Record<GenerationStatus, string> = { running: "生成中", succeeded: "生成成功", failed: "生成失败" };
const promptKinds = [{ label: "图片", value: "image" }, { label: "视频", value: "video" }, { label: "画布已用", value: "canvas" }];
// 填入时按节点类型匹配提示词库
const promptNodeTypes = { image: "remote-imageGenerationNode", video: "remote-videoGenerationNode" };
const promptKind = ref<"image" | "video" | "canvas">("image");
const promptQuery = ref("");
const promptTag = ref("");
const allCloudSources = ref<CloudPromptSource[]>([]);
const cloudLoading = ref(false);
const cloudError = ref("");
const collapsedSources = ref(new Set<number>());
const sourceLimits = ref<Record<number, number>>({});
const detailVisible = ref(false);
const detailItem = ref<CloudPromptItem>();
let releasePreview: (() => void) | undefined;
let loadPreview: ((index: number) => Promise<void>) | undefined;
const failedOnly = ref(false);
const itemMenu = ref<DropdownInstance>();
const menuAnchor = shallowRef({ getBoundingClientRect: () => new DOMRect() });
const menuItem = shallowRef<(typeof items.value)[number]>();
const getNodeTools = useNodeToolsContext();
const retrying = ref(false);
const retryDone = ref(0);
const retryTotal = ref(0);
// ACT: 同时最多重试 2 个节点，每启动一个间隔 1.5 秒，避免批量请求触发供应商 429。
const retryConcurrency = 2;
const retryInterval = 1500;
let retryController: AbortController | undefined;
onScopeDispose(() => retryController?.abort());

const items = computed(() => flow.getNodes.value.filter(node => !node.hidden).map(node => {
  const data = (node.data ?? {}) as { label?: string; prompt?: unknown; outputs?: Record<string, NodeOutput | undefined>; generationStatus?: GenerationStatus };
  const prompt = typeof data.prompt === "string" ? data.prompt.trim() : "";
  const media = Object.values(data.outputs ?? {}).find((output): output is MediaOutput =>
    output?.dataType === "IMAGE" || output?.dataType === "VIDEO" || output?.dataType === "AUDIO");
  // 主标题用节点名称，提示词放到副标题单行省略。
  return { node, prompt, media, status: data.generationStatus, title: String(data.label || typeLabel(node.type)) };
}));
const types = computed(() => [...new Set(items.value.map(item => item.node.type))]);
const failedCount = computed(() => items.value.filter(item => item.status === "failed").length);
const filteredItems = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  return items.value.filter(item => (!typeFilter.value || item.node.type === typeFilter.value) && (!failedOnly.value || item.status === "failed")
    && `${item.title} ${item.prompt} ${typeLabel(item.node.type)}`.toLocaleLowerCase().includes(keyword));
});
// 无筛选时按分组展示为树，子元素缩进在分组下；有搜索、类型或失败筛选时平铺匹配结果。
const visibleItems = computed(() => {
  if (typeFilter.value || failedOnly.value || query.value.trim()) return filteredItems.value.map(item => ({ ...item, depth: 0, isGroup: false, childCount: 0 }));
  const ids = new Set(items.value.map(item => item.node.id));
  const children = new Map<string, typeof items.value>();
  for (const item of items.value) {
    const parent = item.node.parentNode && ids.has(item.node.parentNode) ? item.node.parentNode : "";
    children.set(parent, [...children.get(parent) ?? [], item]);
  }
  const result: ((typeof items.value)[number] & { depth: number; isGroup: boolean; childCount: number })[] = [];
  function append(parent: string, depth: number) {
    for (const item of children.get(parent) ?? []) {
      const childCount = children.get(item.node.id)?.length ?? 0;
      result.push({ ...item, depth, isGroup: item.node.type === "canvasGroup", childCount });
      if (childCount && !collapsed.value.has(item.node.id)) append(item.node.id, depth + 1);
    }
  }
  append("", 0);
  return result;
});
const selectedCount = computed(() => items.value.filter(item => item.node.selected).length);
const prompts = computed(() => {
  const groups = new Map<string, GraphNode[]>();
  for (const item of items.value) if (item.prompt) groups.set(item.prompt, [...groups.get(item.prompt) ?? [], item.node]);
  return [...groups].map(([text, nodes]) => ({ text, nodes }));
});

const kindSources = computed(() => allCloudSources.value.filter(source => source.type === promptKind.value));
const promptTags = computed(() => {
  const counts = new Map<string, number>();
  for (const source of kindSources.value) for (const item of source.items) for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
});
const cloudSources = computed(() => {
  const keyword = promptQuery.value.trim().toLocaleLowerCase();
  if (!keyword && !promptTag.value) return kindSources.value;
  return kindSources.value.map(source => ({
    ...source,
    items: source.items.filter(item => (!promptTag.value || item.tags?.includes(promptTag.value))
      && (!keyword || `${item.title} ${item.prompt} ${item.tags?.join(" ") ?? ""}`.toLocaleLowerCase().includes(keyword))),
  })).filter(source => source.items.length);
});

watch(types, value => { if (typeFilter.value && !value.includes(typeFilter.value)) typeFilter.value = ""; });
watch(() => props.disabled, disabled => { if (disabled) previewVisible.value = false; });
watch(previewVisible, visible => {
  if (visible) return;
  releasePreview?.();
  releasePreview = undefined;
  loadPreview = undefined;
});
watch(previewIndex, index => { if (previewVisible.value) void loadPreview?.(index); });
watch([open, tab], ([visible, current]) => { if (visible && current === "prompts" && !allCloudSources.value.length && !cloudError.value) void loadCloudPrompts(); }, { immediate: true });
watch(promptKind, () => { promptTag.value = ""; });
watch(() => props.disabled, disabled => { if (disabled) detailVisible.value = false; });

function readWidth() {
  let value = NaN;
  try { value = Number(JSON.parse(localStorage.getItem(storageKey) ?? "{}")?.width); } catch { /* 记录损坏时使用默认宽度 */ }
  return Number.isFinite(value) ? Math.min(Math.max(value, minWidth), maxWidth) : 300;
}

function setWidth(value: number, save = false) {
  width.value = Math.round(Math.min(Math.max(value, minWidth), maxWidth));
  if (save) localStorage.setItem(storageKey, JSON.stringify({ width: width.value }));
}

// 拖动中只按帧改 --dragWidth，不触发整个侧栏（含全部列表项）重新渲染；松手后再写回 width。
let resizeStart: { x: number; width: number; panel: HTMLElement; next?: number; frame?: number } | undefined;
function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  const handle = event.currentTarget as HTMLElement;
  const panel = handle.closest<HTMLElement>(".canvasSidePanel");
  if (!panel) return;
  handle.setPointerCapture(event.pointerId);
  resizeStart = { x: event.clientX, width: width.value, panel };
}

function resize(event: PointerEvent) {
  const state = resizeStart;
  if (!state) return;
  state.next = Math.round(Math.min(Math.max(state.width + event.clientX - state.x, minWidth), maxWidth));
  state.frame ??= requestAnimationFrame(() => {
    state.frame = undefined;
    state.panel.style.setProperty("--dragWidth", `${state.next}px`);
  });
}

function finishResize() {
  const state = resizeStart;
  if (!state) return;
  resizeStart = undefined;
  if (state.frame !== undefined) cancelAnimationFrame(state.frame);
  setWidth(state.next ?? width.value, true);
  state.panel.style.removeProperty("--dragWidth");
}

function typeLabel(type: string) {
  if (type === "canvasGroup") return "分组";
  return props.nodeOptions.find(option => option.type === type)?.label ?? type.replace(/^remote-/, "");
}

function typeIcon(type: string) {
  if (type === "canvasGroup") return IconBoxMultiple;
  if (/image/i.test(type)) return IconPhoto;
  if (/video/i.test(type)) return IconVideo;
  if (/audio/i.test(type)) return IconMusic;
  if (/text/i.test(type)) return IconFileText;
  return IconSquare;
}

async function clickNode(node: GraphNode) {
  if (props.disabled) return;
  if (selecting.value) {
    if (node.selected) flow.removeSelectedNodes([node]);
    // 未按多选键时 addSelectedNodes 会先清空已有选择，所以传入完整列表
    else flow.addSelectedNodes([...flow.getSelectedNodes.value, node]);
    flow.nodesSelectionActive.value = flow.getSelectedNodes.value.length > 1;
    return;
  }
  await locateNodes([node]);
}

function toggleGroup(id: string) {
  const next = new Set(collapsed.value);
  if (!next.delete(id)) next.add(id);
  collapsed.value = next;
}

function selectAll() {
  flow.removeSelectedElements();
  flow.addSelectedNodes(filteredItems.value.map(item => item.node));
  flow.nodesSelectionActive.value = filteredItems.value.length > 1;
}

function clearSelection() {
  flow.removeSelectedElements();
  flow.nodesSelectionActive.value = false;
}

async function locateNodes(nodes: GraphNode[]) {
  if (props.disabled) return;
  flow.removeSelectedElements();
  flow.addSelectedNodes(nodes);
  flow.nodesSelectionActive.value = nodes.length > 1;
  await nextTick();
  await flow.fitView({ nodes: nodes.map(node => node.id), padding: 0.4, maxZoom: 1.4, duration: 200 });
}

async function openItemMenu(event: MouseEvent, item: (typeof items.value)[number]) {
  if (props.disabled) return;
  itemMenu.value?.handleClose();
  menuItem.value = item;
  const rect = new DOMRect(event.clientX, event.clientY, 0, 0);
  menuAnchor.value = { getBoundingClientRect: () => rect };
  await nextTick();
  itemMenu.value?.handleOpen();
}

function handleItemCommand(command: string) {
  const item = menuItem.value;
  if (!item || props.disabled || flow.findNode(item.node.id) !== item.node) return;
  if (command === "locate") void locateNodes([item.node]);
  else if (command === "preview") openPreview(item);
  else if (command === "rename") void renameNode(item.node);
  else if (command === "delete") void deleteNodes([item.node]);
}

async function renameNode(node: GraphNode) {
  try {
    const { value } = await ElMessageBox.prompt("名称", "重命名", {
      inputValue: String(node.data?.label || typeLabel(node.type)),
      inputValidator: text => !!text.trim() || "请输入名称",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });
    if (props.disabled || flow.findNode(node.id) !== node) return;
    // 与节点标题手动改名一致，之后生成不再按提示词自动命名。
    Object.assign(node.data, { label: value.trim(), labelLocked: true });
  } catch {
    // 取消重命名
  }
}

async function deleteNodes(nodes: GraphNode[]) {
  const targets = nodes.filter(node => node.deletable !== false);
  if (props.disabled || !targets.length) return;
  try {
    await ElMessageBox.confirm(
      targets.length > 1 ? `确定删除选中的 ${targets.length} 个元素？` : `确定删除“${targets[0]!.data?.label || typeLabel(targets[0]!.type)}”？`,
      "删除元素",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  if (props.disabled) return;
  emit("deleteNodes", targets.filter(node => flow.findNode(node.id) === node));
}

// 焦点在列表项上按 Delete：该项在多选中时删除全部所选，否则只删除该项。
function deleteByKey(event: KeyboardEvent, item: (typeof items.value)[number]) {
  if (event.key !== "Delete" || event.isComposing || event.repeat) return;
  event.preventDefault();
  event.stopPropagation();
  void deleteNodes(item.node.selected && selectedCount.value > 1 ? flow.getSelectedNodes.value : [item.node]);
}

function waitIdle(node: GraphNode, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const timer = setInterval(() => {
      if (signal.aborted || flow.findNode(node.id) !== node || node.data?.generationStatus !== "running") {
        clearInterval(timer);
        resolve();
      }
    }, 1000);
  });
}

// 按列表顺序用失败时的原请求重试；正在生成或没有 retryGeneration 函数的节点跳过。
async function retryFailed() {
  if (props.disabled || retrying.value) return;
  const queue = items.value.filter(item => item.status === "failed").map(item => item.node);
  if (!queue.length) return;
  const controller = new AbortController();
  retryController = controller;
  retrying.value = true;
  retryDone.value = 0;
  retryTotal.value = queue.length;
  let started = 0;
  let skipped = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length && !controller.signal.aborted) {
      const node = queue.shift()!;
      const tools = getNodeTools();
      const canRetry = flow.findNode(node.id) === node && node.data?.generationStatus === "failed"
        && [...tools.list([node.id], ["node:retryGeneration"])].length > 0;
      if (!canRetry) {
        skipped++;
        retryDone.value++;
        continue;
      }
      try {
        await tools.call({ nodeId: node.id, name: "node:retryGeneration", args: {} }, controller.signal);
        started++;
        await waitIdle(node, controller.signal);
      } catch {
        if (!controller.signal.aborted) failed++;
      }
      retryDone.value++;
      if (queue.length && !controller.signal.aborted) await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(retryConcurrency, queue.length) }, (_, index) =>
      new Promise(resolve => setTimeout(resolve, index * retryInterval)).then(worker)));
  } finally {
    if (retryController === controller) retryController = undefined;
    retrying.value = false;
  }
  const stopped = controller.signal.aborted ? "，已停止排队" : "";
  ElMessage({ type: failed ? "warning" : "success", message: `已重试 ${started} 个${skipped ? `，跳过 ${skipped} 个` : ""}${failed ? `，${failed} 个无法启动` : ""}${stopped}` });
}

// 只停止排队中的节点，已在生成的节点继续完成。
function stopRetry() {
  retryController?.abort();
}

// 预览当前筛选结果里的全部图片和视频，切换到哪一项才读取哪一项。
function openPreview(target: (typeof items.value)[number]) {
  if (!props.directory || props.disabled) return;
  releasePreview?.();
  const files = useWorkspaceFiles(props.directory);
  const sources = visibleItems.value.flatMap(item => item.media && item.media.dataType !== "AUDIO" ? [{ ...item, media: item.media }] : []);
  const releases: (() => void)[] = [];
  const loading = new Set<number>();
  let closed = false;
  releasePreview = () => {
    closed = true;
    releases.forEach(release => release());
  };
  previewItems.value = sources.map(item => ({
    url: "", type: item.media.dataType === "VIDEO" ? "video" : "image", prompt: item.prompt || undefined,
    name: item.media.value.url.split(/[\\/]/).at(-1) || item.title, source: String(item.node.data?.label || typeLabel(item.node.type)),
  }));
  previewIndex.value = Math.max(0, sources.findIndex(item => item.node.id === target.node.id));
  loadPreview = async (index: number) => {
    const source = sources[index];
    if (!source || loading.has(index)) return;
    loading.add(index);
    const preview = files.acquireUrl(source.media.value.url, source.media.value.mimeType);
    releases.push(preview.release);
    try {
      const url = await preview.url;
      if (!closed) previewItems.value = previewItems.value.map((item, itemIndex) => itemIndex === index ? { ...item, url } : item);
    } catch (error) {
      loading.delete(index);
      ElMessage.error(error instanceof Error ? error.message : "读取媒体文件失败");
    }
  };
  previewVisible.value = true;
  void loadPreview(previewIndex.value);
}

async function loadCloudPrompts(refresh = false) {
  cloudLoading.value = true;
  cloudError.value = "";
  try {
    allCloudSources.value = await readCloudPrompts(refresh);
  } catch (error) {
    cloudError.value = error instanceof Error ? error.message : "提示词库读取失败";
  } finally {
    cloudLoading.value = false;
  }
}

function toggleSource(id: number) {
  const next = new Set(collapsedSources.value);
  if (!next.delete(id)) next.add(id);
  collapsedSources.value = next;
}

function showDetail(item: CloudPromptItem) {
  detailItem.value = item;
  detailVisible.value = true;
}

const fillTargets = computed(() => promptKind.value === "canvas" ? [] : flow.getSelectedNodes.value.filter(node => node.type === promptNodeTypes[promptKind.value as "image" | "video"]));
const fillLabel = computed(() => fillTargets.value.length ? "填入选中节点" : `新建${promptKind.value === "video" ? "视频" : "图片"}生成节点并填入`);

// 写入选中的同类生成节点，多选时全部填入；没有选中同类节点时新建一个。
function fillPrompt(item: CloudPromptItem) {
  if (props.disabled || promptKind.value === "canvas") return;
  const kindLabel = promptKind.value === "image" ? "图片生成" : "视频生成";
  const targets = fillTargets.value;
  const data = { prompt: item.prompt, promptModel: promptModelOf(item.prompt) };
  if (!targets.length) {
    detailVisible.value = false;
    // 新节点直接用提示词库的标题命名，生成时不会再被提示词自动改名。
    return emit("createNode", promptNodeTypes[promptKind.value as "image" | "video"], { ...data, label: item.title || undefined });
  }
  for (const node of targets) flow.updateNodeData(node.id, data);
  detailVisible.value = false;
  ElMessage.success(targets.length > 1 ? `已填入 ${targets.length} 个${kindLabel}节点` : "提示词已填入");
}

async function copyPrompt(text: string) {
  try {
    await writeClipboardText(text);
    ElMessage.success("提示词已复制");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "复制提示词失败");
  }
}
</script>

<style lang="scss" scoped>
.sidePanelTrigger {
  width: max-content;

  .el-button {
    height: 28px;
    padding: 0 6px;
    font-size: 13px;
  }
}

.canvasSidePanel {
  position: relative;
  max-width: calc(100vw - 30px);
  height: calc(100dvh - 140px);

  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
  }

  .iconButton {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    margin: 0;
    padding: 0;
  }

  .panelHeader {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px 0 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    .panelTabs {
      flex: 1;
      min-width: 0;

      :deep(.el-tabs__header) { margin: 0; }
      :deep(.el-tabs__nav-wrap::after) { display: none; }
      :deep(.el-tabs__item) { height: 40px; padding: 0 10px; }
    }
  }

  .nodesPane,
  .assetsPane,
  .promptsPane {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    padding: 8px;
  }

  .paneToolbar {
    display: flex;
    align-items: center;
    gap: 6px;

    .paneTitle {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .el-button { margin: 0; }
    .typeFilter { width: 104px; flex-shrink: 0; }
  }

  .paneScroll {
    flex: 1;
    min-height: 0;
  }

  .selectionBar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--el-border-color-lighter);

    .selectionCount {
      flex: 1;
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    .el-button { margin: 0; }
  }

  .nodeList,
  .promptList {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nodeItem {
    display: flex;
    align-items: center;
    gap: 2px;
    border-radius: var(--el-border-radius-base);

    &:hover { background: var(--el-fill-color-light); }
    // 深色主题下 primary-light-9 几乎和面板同色，改用主色混合底色加左侧色条。
    &.selected,
    &.selected:hover {
      background: color-mix(in srgb, var(--el-color-primary) 20%, transparent);
      box-shadow: inset 3px 0 0 var(--el-color-primary);
    }

    .nodeMain {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 6px;
      border: 0;
      background: transparent;
      color: var(--el-text-color-primary);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .nodeThumbnail {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      overflow: hidden;
      border-radius: 5px;
      background: var(--el-fill-color-light);
      color: var(--el-text-color-secondary);

      :deep(img),
      :deep(video) { width: 100%; height: 100%; object-fit: cover; }
    }

    .nodeText {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;

      .nodeTitle,
      .nodeType {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .nodeTitle { font-size: 13px; }
      .nodeType { color: var(--el-text-color-secondary); font-size: 12px; }
    }

    .statusDot {
      flex-shrink: 0;
      width: 8px;
      height: 8px;
      border-radius: 50%;

      &.running { background: var(--el-color-primary); animation: statusPulse 1.2s ease-in-out infinite; }
      &.succeeded { background: var(--el-color-success); }
      &.failed { background: var(--el-color-danger); }
    }
  }

  .promptItem {
    display: flex;
    align-items: flex-start;
    gap: 2px;
    border-radius: var(--el-border-radius-base);

    &:hover { background: var(--el-fill-color-light); }

    .promptText {
      display: -webkit-box;
      flex: 1;
      min-width: 0;
      padding: 6px 8px;
      overflow: hidden;
      border: 0;
      background: transparent;
      color: var(--el-text-color-primary);
      font: inherit;
      font-size: 13px;
      line-height: 1.5;
      text-align: left;
      cursor: pointer;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }
  }

  .promptsPane {
    .promptKind { flex-shrink: 0; }
    .searchInput { flex: 1; min-width: 0; }
    .moreButton { width: 100%; margin: 2px 0 6px; }
  }

  .promptSource {
    .sourceHeader {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 6px 4px;
      border: 0;
      background: transparent;
      color: var(--el-text-color-primary);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;

      .sourceName { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sourceCount { color: var(--el-text-color-secondary); font-size: 12px; font-weight: 400; }
    }

    .cloudList {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  }

  .cloudItem {
    display: flex;
    align-items: center;
    gap: 2px;
    border-radius: var(--el-border-radius-base);

    &:hover { background: var(--el-fill-color-light); }

    .cloudMain {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 6px;
      border: 0;
      background: transparent;
      color: var(--el-text-color-primary);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .cloudCover {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 5px;
      background: var(--el-fill-color-light);
      color: var(--el-text-color-secondary);
      object-fit: cover;
    }

    .cloudText {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;

      .cloudTitle {
        overflow: hidden;
        font-size: 13px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cloudSummary {
        display: -webkit-box;
        overflow: hidden;
        color: var(--el-text-color-secondary);
        font-size: 12px;
        line-height: 1.4;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
    }
  }

  .assetsPane {
    padding: 0;

    :deep(.assetLibrary) {
      width: 100%;
      max-height: none;
      height: 100%;
      border: 0;
      background: transparent;
    }

    :deep(.libraryScroll) {
      flex: 1;
      max-height: none;

      .el-scrollbar__wrap { max-height: none !important; }
    }
  }

  .empty {
    margin: 24px 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    text-align: center;
  }

  .resizeHandle {
    position: absolute;
    top: 0;
    right: -4px;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
    touch-action: none;

    &:hover,
    &:focus-visible {
      outline: none;
      background: linear-gradient(to right, transparent 3px, var(--el-color-primary) 3px, var(--el-color-primary) 5px, transparent 5px);
    }
  }
}

@keyframes statusPulse {
  50% { opacity: 0.35; }
}
</style>
