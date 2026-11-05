<template>
  <el-dialog v-model="visible" title="放大图片" width="min(420px, calc(100vw - 32px))" alignCenter appendToBody :closeOnClickModal="!busy" :closeOnPressEscape="!busy" :showClose="!busy" @closed="controller?.abort()">
    <div class="imageUpscale nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
      <div class="upscaleField">
        <span class="fieldLabel">目标长边</span>
        <el-segmented v-model="target" :options="targetOptions" :disabled="busy" block aria-label="目标长边" />
      </div>
      <div class="upscaleField">
        <span class="fieldLabel">算法</span>
        <el-segmented v-model="algorithm" :options="algorithmOptions" :disabled="busy" block aria-label="放大算法" />
      </div>
      <div class="upscaleSummary" aria-live="polite">
        <span>{{ natural.width ? `${natural.width} × ${natural.height}` : "读取尺寸中…" }}</span>
        <icon-arrow-right :size="14" aria-hidden="true" />
        <strong>{{ output.width ? `${output.width} × ${output.height}` : "—" }}</strong>
      </div>
      <p v-if="natural.width && !canUpscale" class="upscaleHint">原图长边已不小于目标尺寸，请选择更大的目标。</p>
      <p class="upscaleHint">本地插值放大，不会补充细节；需要细节增强请用图片生成节点重绘。</p>
      <el-button class="confirmButton" type="primary" :loading="busy" :disabled="disabled || !canUpscale" @click="confirm">放大为新节点</el-button>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElButton, ElDialog, ElSegmented } from "element-plus";
import { IconArrowRight } from "@tabler/icons-vue";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import { canvasBlob, loadImage, useDerivedImageNode } from "../useDerivedImageNode";

const props = defineProps<{ src: string; disabled?: boolean }>();
const createDerived = useDerivedImageNode();
const visible = ref(false);
const busy = ref(false);
const natural = ref({ width: 0, height: 0 });
// 与 infinite-canvas 一致：目标长边 1K/2K/4K，最长 4096。
const target = ref(2048);
const targetOptions = [{ label: "1K", value: 1024 }, { label: "2K", value: 2048 }, { label: "4K", value: 4096 }];
const algorithm = ref<"high" | "bilinear" | "nearest">("high");
const algorithmOptions = [{ label: "高质量", value: "high" }, { label: "双线性", value: "bilinear" }, { label: "像素风", value: "nearest" }];
const output = computed(() => {
  const { width, height } = natural.value;
  if (!width || !height) return { width: 0, height: 0 };
  const scale = target.value / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
});
const canUpscale = computed(() => !!natural.value.width && Math.max(natural.value.width, natural.value.height) < target.value);
let controller: AbortController | undefined;

watch([visible, () => props.src], async ([open, src]) => {
  if (!open || !src) return;
  natural.value = { width: 0, height: 0 };
  try {
    const image = await loadImage(src);
    if (props.src === src) natural.value = { width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) { showNodeError(error, "图片读取失败"); }
});
onBeforeUnmount(() => controller?.abort());

function open() {
  if (props.disabled || !props.src) return;
  visible.value = true;
}

defineExpose({ open, busy });

// 高质量模式逐级 2 倍放大，避免一次大倍率插值产生锯齿和模糊；像素风关闭平滑。
function resample(image: HTMLImageElement, width: number, height: number) {
  let source: CanvasImageSource = image;
  let currentWidth = image.naturalWidth;
  let currentHeight = image.naturalHeight;
  const steps: HTMLCanvasElement[] = [];
  const draw = (nextWidth: number, nextHeight: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片画布");
    context.imageSmoothingEnabled = algorithm.value !== "nearest";
    if (algorithm.value === "high") context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, currentWidth, currentHeight, 0, 0, nextWidth, nextHeight);
    steps.push(canvas);
    source = canvas;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  };
  if (algorithm.value === "high") {
    while (currentWidth * 2 < width && currentHeight * 2 < height) draw(currentWidth * 2, currentHeight * 2);
  }
  draw(width, height);
  const result = steps.pop()!;
  steps.forEach(canvas => { canvas.width = canvas.height = 0; });
  return result;
}

async function confirm() {
  if (busy.value || props.disabled || !canUpscale.value) return;
  busy.value = true;
  controller = new AbortController();
  const signal = controller.signal;
  let canvas: HTMLCanvasElement | undefined;
  try {
    const image = await loadImage(props.src);
    signal.throwIfAborted();
    const { width, height } = output.value;
    canvas = resample(image, width, height);
    const blob = await canvasBlob(canvas);
    signal.throwIfAborted();
    await createDerived(blob, { label: `放大 ${targetOptions.find(item => item.value === target.value)?.label}`, width, height }, signal);
    visible.value = false;
  } catch (error) {
    if (!signal.aborted) showNodeError(error, "放大失败");
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.imageUpscale {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .upscaleField {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fieldLabel {
    color: var(--el-text-color-primary);
    font-size: 13px;
    font-weight: 600;
  }

  .upscaleSummary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px;
    border-radius: 12px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-secondary);
    font-variant-numeric: tabular-nums;

    strong { color: var(--el-text-color-primary); }
  }

  .upscaleHint {
    margin: -8px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    line-height: 1.6;
  }

  .confirmButton { width: 100%; }
}
</style>
