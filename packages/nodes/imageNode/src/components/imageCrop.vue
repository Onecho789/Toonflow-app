<template>
  <el-dialog v-model="visible" title="裁剪图片" width="min(720px, calc(100vw - 32px))" alignCenter appendToBody :closeOnClickModal="!busy" :closeOnPressEscape="!busy" :showClose="!busy" @closed="reset">
    <div class="imageCrop nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
      <div class="cropPresets" role="group" aria-label="裁剪比例">
        <button v-for="item in presets" :key="item.label" type="button" class="presetButton" :aria-pressed="preset === item.label" :disabled="busy" @click="applyPreset(item)">{{ item.label }}</button>
      </div>
      <div class="cropStage">
        <div ref="frame" class="cropFrame">
          <img :src="src" alt="待裁剪图片" draggable="false" @load="readSize" />
          <div class="cropShade" :style="shadeStyle" aria-hidden="true" />
          <div
            class="cropBox"
            :style="boxStyle"
            role="slider"
            tabindex="0"
            aria-label="裁剪区域（方向键移动，Shift+方向键调整大小）"
            :aria-valuetext="`${pixelRect.width}×${pixelRect.height}`"
            @pointerdown.stop.prevent="startDrag($event, 'move')"
            @keydown.stop.prevent="nudge">
            <i class="cropGrid" aria-hidden="true" />
            <span v-for="corner in corners" :key="corner" class="cropHandle" :class="corner" aria-hidden="true" @pointerdown.stop.prevent="startDrag($event, corner)" />
          </div>
        </div>
      </div>
      <div class="cropFooter">
        <span class="cropSize">{{ pixelRect.width }} × {{ pixelRect.height }} px</span>
        <el-button :disabled="busy" @click="applyPreset(presets[0]!)">重置</el-button>
        <el-button type="primary" :loading="busy" :disabled="disabled || !natural.width || pixelRect.width < 1 || pixelRect.height < 1" @click="confirm">裁剪为新节点</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { ElButton, ElDialog } from "element-plus";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import { canvasBlob, loadImage, useDerivedImageNode } from "../useDerivedImageNode";

type Corner = "nw" | "ne" | "sw" | "se";
type Rect = { x: number; y: number; width: number; height: number };
type Preset = { label: string; ratio?: number };

const props = defineProps<{ src: string; disabled?: boolean }>();
const createDerived = useDerivedImageNode();
const visible = ref(false);
const busy = ref(false);
const frame = ref<HTMLElement>();
const natural = ref({ width: 0, height: 0 });
// 裁剪框用 0–1 的相对坐标，与 infinite-canvas 一致，导出时再换算成像素。
const rect = ref<Rect>({ x: 0, y: 0, width: 1, height: 1 });
const preset = ref("自由");
const presets: Preset[] = [
  { label: "自由" }, { label: "原比例" }, { label: "1:1", ratio: 1 }, { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 }, { label: "16:9", ratio: 16 / 9 }, { label: "9:16", ratio: 9 / 16 },
];
const corners: Corner[] = ["nw", "ne", "sw", "se"];
const minSize = 0.04;
let controller: AbortController | undefined;
let drag: { mode: Corner | "move"; startX: number; startY: number; start: Rect; bounds: DOMRect } | undefined;

const lockedRatio = computed(() => {
  const item = presets.find(value => value.label === preset.value);
  if (!item || !natural.value.width) return;
  // 像素比例换算到相对坐标比例。
  const pixelRatio = item.label === "原比例" ? natural.value.width / natural.value.height : item.ratio;
  return pixelRatio && pixelRatio * natural.value.height / natural.value.width;
});
const pixelRect = computed(() => ({
  x: Math.round(rect.value.x * natural.value.width),
  y: Math.round(rect.value.y * natural.value.height),
  width: Math.round(rect.value.width * natural.value.width),
  height: Math.round(rect.value.height * natural.value.height),
}));
const percent = (value: number) => `${value * 100}%`;
const boxStyle = computed(() => ({ left: percent(rect.value.x), top: percent(rect.value.y), width: percent(rect.value.width), height: percent(rect.value.height) }));
const shadeStyle = computed(() => {
  const { x, y, width, height } = rect.value;
  const [left, top, right, bottom] = [x, y, x + width, y + height].map(percent);
  return { clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left} ${top}, ${left} ${bottom}, ${right} ${bottom}, ${right} ${top}, ${left} ${top})` };
});

onBeforeUnmount(() => { controller?.abort(); stopDrag(); });

function open() {
  if (props.disabled || !props.src) return;
  visible.value = true;
}

defineExpose({ open, busy });

function reset() {
  controller?.abort();
  stopDrag();
  preset.value = "自由";
  rect.value = { x: 0, y: 0, width: 1, height: 1 };
}

function readSize(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  natural.value = { width: image.naturalWidth, height: image.naturalHeight };
}

function applyPreset(item: Preset) {
  preset.value = item.label;
  const ratio = lockedRatio.value;
  if (!ratio) return void (rect.value = { x: 0, y: 0, width: 1, height: 1 });
  // 以最大可容纳尺寸居中。
  const width = Math.min(1, ratio);
  const height = width / ratio;
  rect.value = { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

function clampRect(next: Rect) {
  const width = Math.min(1, Math.max(minSize, next.width));
  const height = Math.min(1, Math.max(minSize, next.height));
  return { width, height, x: Math.min(1 - width, Math.max(0, next.x)), y: Math.min(1 - height, Math.max(0, next.y)) };
}

function startDrag(event: PointerEvent, mode: Corner | "move") {
  if (busy.value || !frame.value) return;
  drag = { mode, startX: event.clientX, startY: event.clientY, start: { ...rect.value }, bounds: frame.value.getBoundingClientRect() };
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);
}

function moveDrag(event: PointerEvent) {
  if (!drag) return;
  const { mode, start, bounds } = drag;
  const dx = (event.clientX - drag.startX) / bounds.width;
  const dy = (event.clientY - drag.startY) / bounds.height;
  if (mode === "move") return void (rect.value = clampRect({ ...start, x: start.x + dx, y: start.y + dy }));
  // 拖动角点时对角固定。
  const fixedX = mode.includes("w") ? start.x + start.width : start.x;
  const fixedY = mode.includes("n") ? start.y + start.height : start.y;
  const pointX = Math.min(1, Math.max(0, (mode.includes("w") ? start.x : start.x + start.width) + dx));
  const pointY = Math.min(1, Math.max(0, (mode.includes("n") ? start.y : start.y + start.height) + dy));
  let width = Math.max(minSize, Math.abs(pointX - fixedX));
  let height = Math.max(minSize, Math.abs(pointY - fixedY));
  const ratio = lockedRatio.value;
  if (ratio) {
    const maxWidth = mode.includes("w") ? fixedX : 1 - fixedX;
    const maxHeight = mode.includes("n") ? fixedY : 1 - fixedY;
    if (width / height > ratio) height = width / ratio;
    else width = height * ratio;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width *= scale;
    height *= scale;
  }
  const x = mode.includes("w") ? fixedX - width : fixedX;
  const y = mode.includes("n") ? fixedY - height : fixedY;
  rect.value = clampRect({ x, y, width: Math.min(width, 1 - Math.max(0, x)), height: Math.min(height, 1 - Math.max(0, y)) });
}

function stopDrag() {
  drag = undefined;
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", stopDrag);
  window.removeEventListener("pointercancel", stopDrag);
}

function nudge(event: KeyboardEvent) {
  const step = 0.01;
  const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
  if (!delta || busy.value) return;
  const [dx = 0, dy = 0] = delta;
  const current = rect.value;
  if (!event.shiftKey) return void (rect.value = clampRect({ ...current, x: current.x + dx, y: current.y + dy }));
  const ratio = lockedRatio.value;
  const width = current.width + (dx || (ratio ? dy * ratio : 0));
  const height = ratio ? width / ratio : current.height + dy;
  if (width <= 1 - current.x + 1e-9 && height <= 1 - current.y + 1e-9) rect.value = clampRect({ ...current, width, height });
}

async function confirm() {
  if (busy.value || props.disabled) return;
  const { x, y, width, height } = pixelRect.value;
  if (width < 1 || height < 1) return;
  busy.value = true;
  controller = new AbortController();
  const signal = controller.signal;
  const canvas = document.createElement("canvas");
  try {
    const image = await loadImage(props.src);
    signal.throwIfAborted();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片画布");
    context.drawImage(image, x, y, width, height, 0, 0, width, height);
    const blob = await canvasBlob(canvas);
    signal.throwIfAborted();
    await createDerived(blob, { label: "裁剪", width, height }, signal);
    visible.value = false;
  } catch (error) {
    if (!signal.aborted) showNodeError(error, "裁剪失败");
  } finally {
    canvas.width = canvas.height = 0;
    busy.value = false;
    controller = undefined;
  }
}
</script>

<style scoped lang="scss">
.imageCrop {
  display: flex;
  flex-direction: column;
  gap: 14px;

  .cropPresets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .presetButton {
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 999px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-regular);
    font: inherit;
    font-size: 12px;
    cursor: pointer;

    &:hover:not(:disabled) { color: var(--el-text-color-primary); background: var(--el-fill-color); }
    &[aria-pressed="true"] { border-color: var(--el-text-color-primary); background: var(--el-bg-color); color: var(--el-text-color-primary); font-weight: 600; }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
  }

  .cropStage {
    display: grid;
    place-items: center;
    padding: 12px;
    border-radius: 12px;
    background: var(--el-fill-color-darker);
  }

  .cropFrame {
    position: relative;
    max-width: 100%;
    line-height: 0;
    user-select: none;
    touch-action: none;

    img { display: block; max-width: 100%; max-height: min(56vh, 480px); }
  }

  .cropShade {
    position: absolute;
    inset: 0;
    background: rgb(0 0 0 / 55%);
    pointer-events: none;
  }

  .cropBox {
    position: absolute;
    box-sizing: border-box;
    border: 1.5px solid #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 35%);
    cursor: move;

    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }

    .cropGrid {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(to right, transparent 33.2%, rgb(255 255 255 / 45%) 33.3%, transparent 33.5%, transparent 66.5%, rgb(255 255 255 / 45%) 66.6%, transparent 66.8%),
        linear-gradient(to bottom, transparent 33.2%, rgb(255 255 255 / 45%) 33.3%, transparent 33.5%, transparent 66.5%, rgb(255 255 255 / 45%) 66.6%, transparent 66.8%);
      pointer-events: none;
    }

    .cropHandle {
      position: absolute;
      width: 14px;
      height: 14px;
      border: 2px solid #fff;
      border-radius: 3px;
      background: var(--el-color-primary);
      box-sizing: border-box;

      &.nw { top: -7px; left: -7px; cursor: nwse-resize; }
      &.ne { top: -7px; right: -7px; cursor: nesw-resize; }
      &.sw { bottom: -7px; left: -7px; cursor: nesw-resize; }
      &.se { right: -7px; bottom: -7px; cursor: nwse-resize; }
    }
  }

  .cropFooter {
    display: flex;
    align-items: center;
    gap: 8px;

    .cropSize {
      flex: 1;
      color: var(--el-text-color-secondary);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .el-button { margin: 0; }
  }
}
</style>
