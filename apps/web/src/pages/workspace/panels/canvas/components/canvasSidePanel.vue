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
          <div v-for="item in filteredItems" :key="item.node.id" class="nodeItem" :class="{ selected: item.node.selected }" role="listitem">
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
            <el-button v-if="item.media && item.media.dataType !== 'AUDIO'" class="iconButton" text :icon="IconEye" :aria-label="'预览 ' + item.title" title="预览" @click="openPreview(item.title, item.media)" />
          </div>
          <p v-if="!filteredItems.length" class="empty">{{ items.length ? "没有匹配的元素" : "画布上还没有元素" }}</p>
        </div>
      </el-scrollbar>
    </div>

    <div v-show="tab === 'assets'" class="assetsPane"><slot name="assets" /></div>

    <div v-show="tab === 'prompts'" class="promptsPane">
      <el-scrollbar class="paneScroll">
        <div class="promptList" role="list" aria-label="提示词库">
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
  <mediaPreview v-model="previewVisible" :items="previewItems" />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useVueFlow, type GraphNode } from "@vue-flow/core";
import { ElButton, ElCard, ElInput, ElMessage, ElOption, ElScrollbar, ElSelect, ElTabPane, ElTabs } from "element-plus";
import {
  IconBoxMultiple, IconEye, IconFileText, IconFocus2, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand,
  IconMusic, IconPhoto, IconSearch, IconSquare, IconVideo,
} from "@tabler/icons-vue";
import mediaPreview, { type MediaPreviewItem } from "@toonflow/node-shared/mediaPreview";
import type { NodeOutput } from "@toonflow/nodes-scaffold/values";
import mentionThumbnail from "@/components/agent/mentionThumbnail.vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { writeClipboardText } from "@/lib/clipboard";

type MediaOutput = Extract<NodeOutput, { dataType: "IMAGE" | "VIDEO" | "AUDIO" }>;
type GenerationStatus = "running" | "succeeded" | "failed";

const props = defineProps<{ directory?: string; nodeOptions: { type: string; label: string }[]; disabled?: boolean }>();
const open = defineModel<boolean>("open", { default: false });
const tab = defineModel<"nodes" | "assets" | "prompts">("tab", { default: "nodes" });
const flow = useVueFlow();
const storageKey = "toonflow.canvasSidePanel";
const minWidth = 240;
const maxWidth = 560;
const width = ref(readWidth());
const selecting = ref(false);
const typeFilter = ref("");
const query = ref("");
const previewVisible = ref(false);
const previewItems = ref<MediaPreviewItem[]>([]);
const statusLabels: Record<GenerationStatus, string> = { running: "生成中", succeeded: "生成成功", failed: "生成失败" };
let releasePreview: (() => void) | undefined;

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
const prompts = computed(() => {
  const groups = new Map<string, GraphNode[]>();
  for (const item of items.value) if (item.prompt) groups.set(item.prompt, [...groups.get(item.prompt) ?? [], item.node]);
  return [...groups].map(([text, nodes]) => ({ text, nodes }));
});

watch(types, value => { if (typeFilter.value && !value.includes(typeFilter.value)) typeFilter.value = ""; });
watch(() => props.disabled, disabled => { if (disabled) previewVisible.value = false; });
watch(previewVisible, visible => {
  if (visible) return;
  releasePreview?.();
  releasePreview = undefined;
});

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

async function locateNodes(nodes: GraphNode[]) {
  if (props.disabled) return;
  flow.removeSelectedElements();
  flow.addSelectedNodes(nodes);
  flow.nodesSelectionActive.value = nodes.length > 1;
  await nextTick();
  await flow.fitView({ nodes: nodes.map(node => node.id), padding: 0.4, maxZoom: 1.4, duration: 200 });
}

async function openPreview(name: string, media: MediaOutput) {
  if (!props.directory || props.disabled) return;
  releasePreview?.();
  const preview = useWorkspaceFiles(props.directory).acquireUrl(media.value.url, media.value.mimeType);
  releasePreview = preview.release;
  const item: MediaPreviewItem = { url: "", type: media.dataType === "VIDEO" ? "video" : "image", name: media.value.url.split(/[\\/]/).at(-1) || name };
  previewItems.value = [item];
  previewVisible.value = true;
  try {
    const url = await preview.url;
    if (releasePreview === preview.release) previewItems.value = [{ ...item, url }];
  } catch (error) {
    previewVisible.value = false;
    ElMessage.error(error instanceof Error ? error.message : "读取媒体文件失败");
  }
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
