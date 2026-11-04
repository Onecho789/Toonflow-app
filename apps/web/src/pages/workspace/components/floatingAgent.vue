<template>
  <teleport to="body">
    <aside
      v-bind="$attrs"
      v-show="visible"
      id="agentPanel"
      class="floatingAgent"
      :class="{ docked, maximized: isMaximized, dragging: interaction?.mode === 'move' }"
      :style="panelStyle"
      aria-label="AI 对话"
      @pointerdown="startMenuMove"
      @pointermove="moveInteraction"
      @pointerup="stopInteraction"
      @pointercancel="stopInteraction"
      @lostpointercapture="stopInteraction"
      @dblclick="toggleMaximizeFromMenu">
      <template v-for="handle in resizeHandles" :key="handle.edge">
        <div
          v-if="handle.label"
          class="resizeHandle"
          :class="handle.edge"
          role="separator"
          :aria-label="handle.label"
          :aria-orientation="handle.x ? 'vertical' : 'horizontal'"
          :aria-valuemin="Math.min(handle.x ? minWidth : minHeight, sizeLimit(handle))"
          :aria-valuemax="sizeLimit(handle)"
          :aria-valuenow="handle.x ? width : height"
          tabindex="0"
          @pointerdown.stop="startInteraction($event, handle)"
          @keydown="resizeWithKeyboard($event, handle)" />
        <div v-else class="resizeHandle corner" :class="handle.edge" aria-hidden="true" @pointerdown.stop="startInteraction($event, handle)" />
      </template>
      <agent v-model="visible">
        <template #menuActions>
          <el-button
            v-if="!docked"
            text
            circle
            :aria-label="isMaximized ? '还原对话框' : '最大化对话框'"
            :title="isMaximized ? '还原（双击标题栏）' : '最大化（双击标题栏）'"
            @click="maximized = !maximized">
            <icon-arrows-minimize v-if="isMaximized" :size="17" aria-hidden="true" />
            <icon-arrows-maximize v-else :size="17" aria-hidden="true" />
          </el-button>
          <el-button
            text
            circle
            :aria-label="docked ? '切换为悬浮' : '停靠到右侧'"
            :title="docked ? '切换为悬浮' : '停靠到右侧'"
            @click="docked = !docked">
            <icon-app-window-bottom-right v-if="docked" :size="17" aria-hidden="true" />
            <icon-layout-sidebar-right v-else :size="17" aria-hidden="true" />
          </el-button>
        </template>
      </agent>
    </aside>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue";
import { IconLayoutSidebarRight, IconAppWindowBottomRight, IconArrowsMaximize, IconArrowsMinimize } from "@tabler/icons-vue";
import agent from "@/components/agent/index.vue";
import { settingsStorage } from "@/stores/settings";

type ResizeHandle = { edge: string; x?: "left" | "right"; y?: "top" | "bottom"; label?: string };
type PanelRect = { left: number; top: number; width: number; height: number };

const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ resize: [width: number] }>();
const storageKey = "maimai.agentPanel";
// ACT: 尺寸、位置、停靠与最大化状态随设置保存；只接受有限数值，显示时仍按当前窗口夹紧。
const saved = (() => {
  try {
    const value = JSON.parse(settingsStorage.getItem(storageKey) ?? "null");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
})();
const savedNumber = (key: string) => {
  const value = saved[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};
const minWidth = 320;
const minHeight = 240;
const docked = ref(saved.docked === true);
const maximized = ref(saved.maximized === true);
const isMaximized = computed(() => maximized.value && !docked.value);
const viewport = reactive({ width: window.innerWidth, height: window.innerHeight });
const gap = computed(() => Math.min(15, viewport.width / 2, viewport.height / 2));
const maxWidth = computed(() => Math.max(0, docked.value ? viewport.width * 0.45 : viewport.width - gap.value * 2));
const preferredWidth = ref(Math.max(minWidth, savedNumber("width") ?? 420));
const width = computed(() => (isMaximized.value ? maxWidth.value : Math.min(preferredWidth.value, maxWidth.value)));
const savedHeight = savedNumber("height");
const preferredHeight = ref(savedHeight === undefined ? undefined : Math.max(minHeight, savedHeight));
const height = computed(() =>
  docked.value
    ? viewport.height
    : Math.max(0, isMaximized.value ? viewport.height - gap.value * 2 : Math.min(preferredHeight.value ?? viewport.height * 0.8, viewport.height - gap.value * 2))
);
const resizeHandles = computed<ResizeHandle[]>(() => {
  if (docked.value) return [{ edge: "left", x: "left", label: "从左侧调整对话宽度" }];
  if (isMaximized.value) return [];
  return [
    { edge: "left", x: "left", label: "从左侧调整对话宽度" },
    { edge: "right", x: "right", label: "从右侧调整对话宽度" },
    { edge: "top", y: "top", label: "从上方调整对话高度" },
    { edge: "bottom", y: "bottom", label: "从下方调整对话高度" },
    { edge: "topLeft", x: "left", y: "top" },
    { edge: "topRight", x: "right", y: "top" },
    { edge: "bottomLeft", x: "left", y: "bottom" },
    { edge: "bottomRight", x: "right", y: "bottom" },
  ];
});
const right = ref(Math.max(0, savedNumber("right") ?? 15));
const bottom = ref(Math.max(0, savedNumber("bottom") ?? 15));
const left = computed(() => Math.max(gap.value, Math.min(viewport.width - width.value - right.value, viewport.width - gap.value - width.value)));
const top = computed(() => Math.max(gap.value, Math.min(viewport.height - height.value - bottom.value, viewport.height - gap.value - height.value)));
const panelStyle = computed(() => ({
  left: `${docked.value ? viewport.width - width.value : left.value}px`,
  top: `${docked.value || isMaximized.value ? (docked.value ? 0 : gap.value) : top.value}px`,
  width: `${width.value}px`,
  height: `${height.value}px`,
}));
const interaction = shallowRef<
  PanelRect & {
    mode: "move" | ResizeHandle;
    pointerId: number;
    element: HTMLElement;
    x: number;
    y: number;
  }
>();

function movePanel(x: number, y: number) {
  right.value = viewport.width - width.value - Math.max(gap.value, Math.min(x, viewport.width - gap.value - width.value));
  bottom.value = viewport.height - height.value - Math.max(gap.value, Math.min(y, viewport.height - gap.value - height.value));
}

function currentRect(): PanelRect {
  return { left: docked.value ? viewport.width - width.value : left.value, top: top.value, width: width.value, height: height.value };
}

function clampSize(value: number, min: number, limit: number) {
  return Math.min(limit, Math.max(Math.min(min, limit), value));
}

function sizeLimit(handle: ResizeHandle, rect = currentRect()) {
  if (handle.x === "left") return docked.value ? maxWidth.value : Math.min(maxWidth.value, rect.left + rect.width - gap.value);
  if (handle.x === "right") return Math.max(0, Math.min(maxWidth.value, viewport.width - gap.value - rect.left));
  if (handle.y === "top") return Math.max(0, rect.top + rect.height - gap.value);
  return Math.max(0, viewport.height - gap.value - rect.top);
}

// ACT: 以拖动开始时的矩形为基准，横纵两个方向各自固定对边，四边与四角共用同一套夹紧规则。
function resizeTo(handle: ResizeHandle, rect: PanelRect, dx: number, dy: number) {
  let { left: x, top: y } = rect;
  if (handle.x) {
    const limit = sizeLimit({ edge: handle.edge, x: handle.x }, rect);
    const size = clampSize(rect.width + (handle.x === "left" ? -dx : dx), minWidth, limit);
    preferredWidth.value = size;
    if (handle.x === "left") x = rect.left + rect.width - size;
  }
  if (handle.y && !docked.value) {
    const limit = sizeLimit({ edge: handle.edge, y: handle.y }, rect);
    const size = clampSize(rect.height + (handle.y === "top" ? -dy : dy), minHeight, limit);
    preferredHeight.value = size;
    if (handle.y === "top") y = rect.top + rect.height - size;
  }
  if (!docked.value) movePanel(x, y);
}

function resizeWithKeyboard(event: KeyboardEvent, handle: ResizeHandle) {
  const keys = handle.x ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  const direction = keys.indexOf(event.key);
  if (direction < 0) return;
  event.preventDefault();
  const delta = direction === 0 ? -16 : 16;
  resizeTo(handle, currentRect(), handle.x ? delta : 0, handle.y ? delta : 0);
}

function isMenuTarget(event: Event) {
  const target = event.target as HTMLElement;
  return !!target.closest(".agentMenu") && !target.closest("button, input, textarea, select, a, [contenteditable], .el-input, .conversationTitle");
}

function startMenuMove(event: PointerEvent) {
  if (isMenuTarget(event)) startInteraction(event, "move");
}

function toggleMaximizeFromMenu(event: MouseEvent) {
  if (docked.value || !isMenuTarget(event)) return;
  stopInteraction();
  maximized.value = !maximized.value;
}

function startInteraction(event: PointerEvent, mode: "move" | ResizeHandle) {
  if (event.button !== 0 || interaction.value || (mode === "move" && (docked.value || isMaximized.value))) return;
  event.preventDefault();
  const element = event.currentTarget as HTMLElement;
  element.setPointerCapture(event.pointerId);
  interaction.value = { ...currentRect(), mode, pointerId: event.pointerId, element, x: event.clientX, y: event.clientY };
}

function moveInteraction(event: PointerEvent) {
  const current = interaction.value;
  if (!current || current.pointerId !== event.pointerId) return;
  const dx = event.clientX - current.x;
  const dy = event.clientY - current.y;
  if (current.mode === "move") movePanel(current.left + dx, current.top + dy);
  else resizeTo(current.mode, current, dx, dy);
}

function stopInteraction(event?: PointerEvent) {
  const current = interaction.value;
  if (event && current?.pointerId !== event.pointerId) return;
  interaction.value = undefined;
  if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
  if (current?.element === document.activeElement) current.element.blur();
}

function resizeViewport() {
  stopInteraction();
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
}

// ACT: 设置变更会触发保存请求，拖动过程中合并为停手后一次写入。
let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persistPanel() {
  persistTimer = undefined;
  settingsStorage.setItem(
    storageKey,
    JSON.stringify({
      width: Math.round(preferredWidth.value),
      height: preferredHeight.value === undefined ? undefined : Math.round(preferredHeight.value),
      right: Math.round(right.value),
      bottom: Math.round(bottom.value),
      docked: docked.value,
      maximized: maximized.value,
    })
  );
}
watch([preferredWidth, preferredHeight, right, bottom, docked, maximized], () => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistPanel, 400);
});

watch([visible, docked, maximized], () => stopInteraction());
watch(
  () => (visible.value && docked.value ? width.value : 0),
  (value) => emit("resize", value),
  { immediate: true }
);
window.addEventListener("resize", resizeViewport);
onBeforeUnmount(() => {
  stopInteraction();
  window.removeEventListener("resize", resizeViewport);
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistPanel();
  }
});
</script>

<style scoped lang="scss">
.floatingAgent {
  position: fixed;
  z-index: 1001;
  box-sizing: border-box;
  max-width: 100vw;
  max-height: 100dvh;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--ui-radius-large, 12px);
  background: color-mix(in srgb, var(--el-bg-color-overlay) 70%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: var(--el-box-shadow-light);

  &.docked {
    border-width: 0 0 0 1px;
    border-radius: 0;
    background: var(--el-bg-color-overlay);
    box-shadow: none;
  }

  :deep(.agent) {
    border-radius: inherit;
  }
  &:not(.docked):not(.maximized) :deep(.agentMenu) {
    cursor: grab;
    touch-action: none;
  }

  &.dragging {
    user-select: none;
    :deep(.agentMenu) {
      cursor: grabbing;
    }
  }

  // 热区 8px：3px 落在面板外，5px 落在面板内，避免挡住内容滚动条。
  .resizeHandle {
    position: absolute;
    z-index: 1;
    touch-action: none;

    &.left,
    &.right {
      top: 14px;
      bottom: 14px;
      width: 8px;
      cursor: ew-resize;
    }
    &.top,
    &.bottom {
      right: 14px;
      left: 14px;
      height: 8px;
      cursor: ns-resize;
    }
    &.left {
      left: -3px;
    }
    &.right {
      right: -3px;
    }
    &.top {
      top: -3px;
    }
    &.bottom {
      bottom: -3px;
    }

    &.corner {
      z-index: 2;
      width: 16px;
      height: 16px;
    }
    &.topLeft {
      top: -3px;
      left: -3px;
      cursor: nwse-resize;
    }
    &.topRight {
      top: -3px;
      right: -3px;
      cursor: nesw-resize;
    }
    &.bottomLeft {
      bottom: -3px;
      left: -3px;
      cursor: nesw-resize;
    }
    &.bottomRight {
      right: -3px;
      bottom: -3px;
      color: var(--el-text-color-placeholder);
      cursor: nwse-resize;

      // 右下角可见的斜纹缩放手柄。
      &::after {
        position: absolute;
        right: 6px;
        bottom: 6px;
        width: 10px;
        height: 10px;
        background: linear-gradient(
          135deg,
          transparent 0 42%,
          currentColor 42% 52%,
          transparent 52% 66%,
          currentColor 66% 76%,
          transparent 76%
        );
        content: "";
      }
      &:hover {
        color: var(--el-color-primary);
      }
    }

    &[role="separator"]:hover,
    &[role="separator"]:focus-visible {
      background: var(--el-color-primary-light-5);
    }
  }

  &.docked .resizeHandle.left {
    top: 0;
    bottom: 0;
    left: 0;
  }
}
</style>
