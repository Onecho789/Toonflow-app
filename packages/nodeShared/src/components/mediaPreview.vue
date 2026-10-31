<template>
  <teleport to="body">
    <div
      v-if="visible && current"
      ref="dialogElement"
      class="mediaPreview nodrag nopan nowheel"
      role="dialog"
      aria-modal="true"
      :aria-label="current.type === 'image' ? '图片预览' : '视频预览'"
      tabindex="-1"
      :style="{ zIndex }"
      @keydown="handleKey"
      @pointerdown.stop
      @mousedown.stop
      @dblclick.stop
      @contextmenu.stop>
      <div class="previewToolbar">
        <span class="previewInfo">
          <span class="previewName" :title="current.name">{{ current.name }}</span>
          <span v-if="details" class="previewMeta">{{ details }}</span>
        </span>
        <span v-if="items.length > 1" class="previewCount">{{ activeIndex + 1 }} / {{ items.length }}</span>
        <template v-if="current.type === 'image'">
          <button type="button" class="previewButton" title="缩小（-）" aria-label="缩小" @click="zoomBy(1 / 1.25)"><icon-zoom-out :size="20" /></button>
          <button type="button" class="previewButton percentButton" :title="actualSize ? '适应窗口（0）' : '原始大小（1）'" :aria-label="actualSize ? '适应窗口' : '原始大小'" @click="actualSize ? resetView() : showActualSize()">{{ percent }}</button>
          <button type="button" class="previewButton" title="放大（+）" aria-label="放大" @click="zoomBy(1.25)"><icon-zoom-in :size="20" /></button>
          <button type="button" class="previewButton" title="向左旋转（Shift+R）" aria-label="向左旋转" @click="rotation -= 90"><icon-rotate :size="20" /></button>
          <button type="button" class="previewButton" title="向右旋转（R）" aria-label="向右旋转" @click="rotation += 90"><icon-rotate-clockwise :size="20" /></button>
          <button type="button" class="previewButton" title="复原（0）" aria-label="复原" @click="restoreView"><icon-arrows-minimize :size="20" /></button>
        </template>
        <button v-if="current.prompt" type="button" class="previewButton" title="复制提示词" aria-label="复制提示词" @click="copyPrompt"><icon-copy :size="20" /></button>
        <a
          class="previewButton"
          :href="current.url || undefined"
          :download="current.name || ''"
          :aria-disabled="!current.url"
          title="下载"
          aria-label="下载"><icon-download :size="20" /></a>
        <button ref="closeButton" type="button" class="previewButton" title="关闭" aria-label="关闭" @click="close"><icon-x :size="20" /></button>
      </div>
      <div
        v-if="current.type === 'image'"
        ref="stage"
        class="previewStage"
        :class="{ dragging: !!drag }"
        @wheel.prevent="zoomImage"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="drag = undefined"
        @pointercancel="drag = undefined"
        @dblclick="resetView">
        <img
          v-if="current.url"
          :src="current.url"
          :alt="current.name || '预览图片'"
          draggable="false"
          :style="{ transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale}) rotate(${rotation}deg)` }"
          @load="readDimensions" />
        <span v-else class="previewLoading">加载中…</span>
      </div>
      <div v-else class="previewStage videoStage" @click.self="close">
        <video v-if="current.url" :key="current.url" :src="current.url" controls autoplay playsinline :aria-label="current.name || '预览视频'" @loadedmetadata="readDimensions" />
        <span v-else class="previewLoading">加载中…</span>
      </div>
      <template v-if="items.length > 1">
        <button type="button" class="previewButton switchButton previous" title="上一个" aria-label="上一个" @click="switchItem(-1)"><icon-chevron-left :size="28" /></button>
        <button type="button" class="previewButton switchButton next" title="下一个" aria-label="下一个" @click="switchItem(1)"><icon-chevron-right :size="28" /></button>
      </template>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { ElMessage, useZIndex } from "element-plus";
import {
  IconArrowsMinimize, IconChevronLeft, IconChevronRight, IconCopy, IconDownload, IconRotate, IconRotateClockwise, IconX, IconZoomIn, IconZoomOut,
} from "@tabler/icons-vue";
import { showNodeError } from "../showNodeError";

export interface MediaPreviewItem {
  url: string;
  type: "image" | "video";
  name?: string;
  // 所属节点或来源说明，显示在文件名下方
  source?: string;
  prompt?: string;
  // 字节数；不传时按 url 读取
  size?: number;
}

const props = defineProps<{ items: MediaPreviewItem[] }>();
const visible = defineModel<boolean>({ default: false });
const activeIndex = defineModel<number>("index", { default: 0 });
const { nextZIndex } = useZIndex();
const zIndex = ref(0);
const dialogElement = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
const stage = ref<HTMLElement>();
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const drag = ref<{ pointerId: number; x: number; y: number }>();
const rotation = ref(0);
// 原始像素尺寸与加载时适应窗口的显示宽度，用于百分比和 1:1
// ACT: 适应宽度只在加载时读取，预览中调整窗口大小后百分比会有偏差，需要时可改用 ResizeObserver。
const dimensions = ref<{ width: number; height: number; fitWidth: number }>();
const fileSize = ref<number>();
const current = computed(() => props.items[activeIndex.value] ?? props.items[0]);
const writeClipboardText = inject<(text: string) => Promise<void>>("writeClipboardText", text => navigator.clipboard.writeText(text));
const actualScale = computed(() => dimensions.value?.fitWidth ? dimensions.value.width / dimensions.value.fitWidth : 1);
const actualSize = computed(() => Math.abs(scale.value - actualScale.value) < 0.001);
const percent = computed(() => `${Math.round(scale.value / actualScale.value * 100)}%`);
const details = computed(() => [
  current.value?.source,
  dimensions.value && `${dimensions.value.width} × ${dimensions.value.height}`,
  fileSize.value !== undefined && formatSize(fileSize.value),
].filter(Boolean).join(" · "));
let returnFocus: HTMLElement | undefined;

watch(visible, async open => {
  if (!open) {
    returnFocus?.focus();
    returnFocus = undefined;
    return;
  }
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  zIndex.value = nextZIndex();
  restoreView();
  void readSize();
  await nextTick();
  closeButton.value?.focus();
}, { immediate: true });
watch(() => current.value?.url, () => {
  restoreView();
  dimensions.value = undefined;
  void readSize();
});

function close() {
  visible.value = false;
}

function resetView() {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
  drag.value = undefined;
}

// 复原同时清除旋转；百分比按钮只切换缩放
function restoreView() {
  resetView();
  rotation.value = 0;
}

function switchItem(step: number) {
  activeIndex.value = (activeIndex.value + step + props.items.length) % props.items.length;
}

function readDimensions(event: Event) {
  const element = event.target as HTMLImageElement | HTMLVideoElement;
  const width = element instanceof HTMLImageElement ? element.naturalWidth : element.videoWidth;
  const height = element instanceof HTMLImageElement ? element.naturalHeight : element.videoHeight;
  if (width && height) dimensions.value = { width, height, fitWidth: element.clientWidth || width };
}

async function readSize() {
  const item = current.value;
  fileSize.value = item?.size;
  if (!item?.url || item.size !== undefined) return;
  try {
    // blob 地址只能 GET（本地内存，开销小）；其余地址用 HEAD 读 Content-Length，读不到不显示
    const response = await fetch(item.url, item.url.startsWith("blob:") ? undefined : { method: "HEAD" });
    const size = item.url.startsWith("blob:") ? (await response.blob()).size : Number(response.headers.get("content-length"));
    if (current.value === item && Number.isFinite(size) && size > 0) fileSize.value = size;
  } catch { /* 大小只是附加信息 */ }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function setScale(nextScale: number, originX = 0, originY = 0) {
  const value = Math.min(20, Math.max(0.1, nextScale));
  // 以 origin（相对舞台中心）为中心缩放：图片以舞台中心为变换原点，保持该点不动
  offsetX.value = originX - (originX - offsetX.value) * value / scale.value;
  offsetY.value = originY - (originY - offsetY.value) * value / scale.value;
  scale.value = value;
}

function zoomBy(factor: number) {
  setScale(scale.value * factor);
}

function showActualSize() {
  offsetX.value = 0;
  offsetY.value = 0;
  scale.value = actualScale.value;
}

function zoomImage(event: WheelEvent) {
  const rect = stage.value?.getBoundingClientRect();
  if (!rect) return;
  setScale(scale.value * Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
}

async function copyPrompt() {
  try {
    await writeClipboardText(current.value?.prompt ?? "");
    ElMessage.success("提示词已复制");
  } catch (error) {
    showNodeError(error, "复制提示词失败");
  }
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  drag.value = { pointerId: event.pointerId, x: event.clientX - offsetX.value, y: event.clientY - offsetY.value };
}

function moveDrag(event: PointerEvent) {
  if (drag.value?.pointerId !== event.pointerId) return;
  offsetX.value = event.clientX - drag.value.x;
  offsetY.value = event.clientY - drag.value.y;
}

const imageKeys: Record<string, ((event: KeyboardEvent) => void) | undefined> = {
  "+": () => zoomBy(1.25),
  "=": () => zoomBy(1.25),
  "-": () => zoomBy(1 / 1.25),
  "0": restoreView,
  "1": showActualSize,
  r: () => { rotation.value += 90; },
  R: () => { rotation.value -= 90; },
};

function handleKey(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (props.items.length > 1 && !(event.target instanceof HTMLVideoElement) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    // 焦点在视频上时方向键留给视频快进快退
    event.preventDefault();
    switchItem(event.key === "ArrowLeft" ? -1 : 1);
  } else if (current.value?.type === "image" && imageKeys[event.key]) {
    event.preventDefault();
    imageKeys[event.key]!(event);
  } else if (event.key === "Tab") {
    // 焦点限制在弹窗内循环
    const focusable = [...dialogElement.value?.querySelectorAll<HTMLElement>("a[href], button, video") ?? []];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
</script>

<style scoped lang="scss">
.mediaPreview {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: rgb(0 0 0 / 82%);
  color: #fff;
  outline: none;

  .previewToolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;

    .previewInfo {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;

      .previewName,
      .previewMeta {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .previewMeta { font-size: 12px; opacity: 0.7; }
    }

    .previewCount { font-size: 13px; opacity: 0.8; }

    .percentButton {
      width: 56px;
      border-radius: 18px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
  }

  .previewButton {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgb(255 255 255 / 12%);
    color: inherit;
    cursor: pointer;

    &:hover { background: rgb(255 255 255 / 24%); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    &[aria-disabled="true"] { opacity: 0.4; pointer-events: none; }
  }

  .previewStage {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
    cursor: grab;

    &.dragging { cursor: grabbing; }

    &.videoStage {
      padding: 0 64px 24px;
      touch-action: auto;
      cursor: auto;
    }

    img {
      max-width: 100%;
      max-height: 100%;
      user-select: none;
      transform-origin: center;
    }

    video {
      max-width: 100%;
      max-height: 100%;
    }

    .previewLoading { opacity: 0.7; }
  }

  .switchButton {
    position: absolute;
    top: 50%;
    width: 44px;
    height: 44px;
    transform: translateY(-50%);

    &.previous { left: 12px; }
    &.next { right: 12px; }
  }
}
</style>
