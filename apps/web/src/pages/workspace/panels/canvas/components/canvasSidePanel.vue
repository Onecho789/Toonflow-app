<template>
  <el-card v-if="!open" class="sidePanelTrigger" shadow="never" :bodyStyle="{ padding: '2px 4px' }">
    <el-button text :icon="IconLayoutSidebarLeftExpand" :disabled="disabled" aria-label="展开画布侧栏" title="展开画布侧栏" @click="open = true">
      画布元素 {{ items.length }}
    </el-button>
  </el-card>
  <el-card v-show="open" class="canvasSidePanel" shadow="never" :bodyStyle="{ padding: '0' }" :style="{ width: `${width}px` }" role="region" aria-label="画布侧栏" @dblclick.stop>
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
        <el-select v-model="typeFilter" class="typeFilter" size="small" aria-label="按类型筛选" clearable placeholder="全部类型">
          <el-option v-for="type in types" :key="type" :label="typeLabel(type)" :value="type" />
        </el-select>
      </div>
      <el-input v-model="query" class="searchInput" size="small" :prefixIcon="IconSearch" placeholder="搜索提示词、名称或类型" aria-label="搜索画布元素" clearable @keydown.esc.stop="query = ''" />
      <el-scrollbar class="paneScroll">
        <div class="nodeList" role="list" aria-label="画布元素">
          <div v-for="item in visibleItems" :key="item.node.id" class="nodeItem" :class="{ selected: item.node.selected }" :style="{ paddingLeft: `${item.depth * 16}px` }" role="listitem">
            <el-button v-if="item.isGroup && item.childCount" class="iconButton foldButton" text :icon="collapsed.has(item.node.id) ? IconChevronRight : IconChevronDown" :aria-label="collapsed.has(item.node.id) ? '展开分组' : '折叠分组'" :aria-expanded="!collapsed.has(item.node.id)" @click="toggleGroup(item.node.id)" />
            <button class="nodeMain" type="button" :aria-pressed="selecting ? !!item.node.selected : undefined" :title="item.title" @click="clickNode(item.node)">
              <mentionThumbnail v-if="item.media" class="nodeThumbnail" :thumbnail="item.media.value" :directory="directory">
                <component :is="typeIcon(item.node.type)" :size="18" />
              </mentionThumbnail>
              <span v-else class="nodeThumbnail"><component :is="typeIcon(item.node.type)" :size="18" /></span>
              <span class="nodeText">
                <span class="nodeTitle">{{ item.title }}</span>
                <span class="nodeType">{{ typeLabel(item.node.type) }}</span>
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
        <el-button size="small" type="primary" :disabled="disabled || !selectedCount" @click="emit('exportSelection')">导出所选</el-button>
      </div>
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
                <el-button class="iconButton" text :icon="IconArrowBarToRight" :disabled="disabled" aria-label="填入选中节点" title="填入选中节点" @click="fillPrompt(item)" />
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
  <promptDetail v-model="detailVisible" :item="detailItem" fillLabel="填入选中节点" :fillDisabled="disabled" @fill="fillPrompt" />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useVueFlow, type GraphNode } from "@vue-flow/core";
import { ElButton, ElCard, ElInput, ElMessage, ElOption, ElScrollbar, ElSegmented, ElSelect, ElTabPane, ElTabs, vLoading } from "element-plus";
import {
  IconArrowBarToRight, IconBoxMultiple, IconChevronDown, IconChevronRight, IconCopy, IconEye, IconFileText, IconFocus2, IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand, IconMusic, IconPhoto, IconRefresh, IconSearch, IconSquare, IconVideo,
} from "@tabler/icons-vue";
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
const emit = defineEmits<{ exportSelection: [] }>();
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

const items = computed(() => flow.getNodes.value.filter(node => !node.hidden).map(node => {
  const data = (node.data ?? {}) as { label?: string; prompt?: unknown; outputs?: Record<string, NodeOutput | undefined>; generationStatus?: GenerationStatus };
  const prompt = typeof data.prompt === "string" ? data.prompt.trim() : "";
  const media = Object.values(data.outputs ?? {}).find((output): output is MediaOutput =>
    output?.dataType === "IMAGE" || output?.dataType === "VIDEO" || output?.dataType === "AUDIO");
  return { node, prompt, media, status: data.generationStatus, title: prompt || String(data.label || typeLabel(node.type)) };
}));
const types = computed(() => [...new Set(items.value.map(item => item.node.type))]);
const filteredItems = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  return items.value.filter(item => (!typeFilter.value || item.node.type === typeFilter.value)
    && `${item.title} ${item.node.data?.label ?? ""} ${typeLabel(item.node.type)}`.toLocaleLowerCase().includes(keyword));
});
// 无筛选时按分组展示为树，子元素缩进在分组下；有搜索或类型筛选时平铺匹配结果。
const visibleItems = computed(() => {
  if (typeFilter.value || query.value.trim()) return filteredItems.value.map(item => ({ ...item, depth: 0, isGroup: false, childCount: 0 }));
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

let resizeStart: { x: number; width: number } | undefined;
function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  resizeStart = { x: event.clientX, width: width.value };
}

function resize(event: PointerEvent) {
  if (resizeStart) setWidth(resizeStart.width + event.clientX - resizeStart.x);
}

function finishResize() {
  if (!resizeStart) return;
  resizeStart = undefined;
  setWidth(width.value, true);
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

// 写入选中的同类生成节点；多选时全部填入
function fillPrompt(item: CloudPromptItem) {
  if (props.disabled || promptKind.value === "canvas") return;
  const kindLabel = promptKind.value === "image" ? "图片生成" : "视频生成";
  const targets = flow.getSelectedNodes.value.filter(node => node.type === promptNodeTypes[promptKind.value as "image" | "video"]);
  if (!targets.length) return void ElMessage.warning(`请先在画布上选中${kindLabel}节点`);
  for (const node of targets) flow.updateNodeData(node.id, { prompt: item.prompt, promptModel: promptModelOf(item.prompt) });
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
    &.selected { background: var(--el-color-primary-light-9); }

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
