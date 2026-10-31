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
        <span class="previewName" :title="current.name">{{ current.name }}</span>
        <span v-if="items.length > 1" class="previewCount">{{ activeIndex + 1 }} / {{ items.length }}</span>
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
          :style="{ transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }" />
        <span v-else class="previewLoading">加载中…</span>
      </div>
      <div v-else class="previewStage videoStage" @click.self="close">
        <video v-if="current.url" :key="current.url" :src="current.url" controls autoplay playsinline :aria-label="current.name || '预览视频'" />
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
import { computed, nextTick, ref, watch } from "vue";
import { useZIndex } from "element-plus";
import { IconChevronLeft, IconChevronRight, IconDownload, IconX } from "@tabler/icons-vue";

export interface MediaPreviewItem {
  url: string;
  type: "image" | "video";
  name?: string;
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
const current = computed(() => props.items[activeIndex.value] ?? props.items[0]);
let returnFocus: HTMLElement | undefined;

watch(visible, async open => {
  if (!open) {
    returnFocus?.focus();
    returnFocus = undefined;
    return;
  }
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  zIndex.value = nextZIndex();
  resetView();
  await nextTick();
  closeButton.value?.focus();
}, { immediate: true });
watch(() => current.value?.url, resetView);

function close() {
  visible.value = false;
}

function resetView() {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
  drag.value = undefined;
}

function switchItem(step: number) {
  activeIndex.value = (activeIndex.value + step + props.items.length) % props.items.length;
}

function zoomImage(event: WheelEvent) {
  const rect = stage.value?.getBoundingClientRect();
  if (!rect) return;
  const nextScale = Math.min(20, Math.max(0.1, scale.value * Math.exp(-event.deltaY * 0.0015)));
  // 以指针为中心缩放：图片以舞台中心为变换原点，保持指针下的点不动
  const pointerX = event.clientX - rect.left - rect.width / 2;
  const pointerY = event.clientY - rect.top - rect.height / 2;
  offsetX.value = pointerX - (pointerX - offsetX.value) * nextScale / scale.value;
  offsetY.value = pointerY - (pointerY - offsetY.value) * nextScale / scale.value;
  scale.value = nextScale;
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

function handleKey(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (current.value?.type === "image" && props.items.length > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    switchItem(event.key === "ArrowLeft" ? -1 : 1);
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

    .previewName {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .previewCount { font-size: 13px; opacity: 0.8; }
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
