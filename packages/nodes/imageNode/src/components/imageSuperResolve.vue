<template>
  <el-dialog v-model="visible" title="AI 超分" width="min(420px, calc(100vw - 32px))" alignCenter appendToBody :closeOnClickModal="!busy" :closeOnPressEscape="!busy" :showClose="!busy" @closed="controller?.abort()">
    <div class="imageSuperResolve nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
      <div class="resolveField">
        <span class="fieldLabel">放大倍数</span>
        <el-segmented v-model="scale" :options="scaleOptions" :disabled="busy" block aria-label="放大倍数" />
      </div>
      <div class="resolveSummary" aria-live="polite">
        <span>{{ natural.width ? `${natural.width} × ${natural.height}` : "读取尺寸中…" }}</span>
        <icon-arrow-right :size="14" aria-hidden="true" />
        <strong>{{ natural.width ? `${natural.width * scale} × ${natural.height * scale}` : "—" }}</strong>
      </div>
      <p v-if="tooLarge" class="resolveHint">输出长边超过 {{ superResolveMaxEdge }} 像素，请改用 ×2 或先裁剪。</p>
      <div v-if="busy" class="resolveProgress">
        <el-progress :percentage="percentage" :strokeWidth="8" :format="() => progressText" aria-label="超分进度" />
      </div>
      <p class="resolveHint">使用 Real-ESRGAN 模型在本机运行，补充细节、去除模糊与压缩噪点；有独立显卡时走 WebGPU，否则用 CPU，较慢。</p>
      <div class="resolveActions">
        <el-button v-if="busy" @click="controller?.abort()">取消</el-button>
        <el-button class="confirmButton" type="primary" :loading="busy" :disabled="disabled || !natural.width || tooLarge" @click="confirm">超分为新节点</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElButton, ElDialog, ElProgress, ElSegmented } from "element-plus";
import { IconArrowRight } from "@tabler/icons-vue";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import { canvasBlob, loadImage, useDerivedImageNode } from "../useDerivedImageNode";
import { superResolve, superResolveMaxEdge, type SuperResolveProgress } from "../superResolve";

const props = defineProps<{ src: string; disabled?: boolean }>();
const createDerived = useDerivedImageNode();
const visible = ref(false);
const busy = ref(false);
const natural = ref({ width: 0, height: 0 });
const scale = ref<2 | 4>(4);
const scaleOptions = [{ label: "×2", value: 2 }, { label: "×4", value: 4 }];
const progress = ref<SuperResolveProgress>();
const tooLarge = computed(() => Math.max(natural.value.width, natural.value.height) * scale.value > superResolveMaxEdge);
const percentage = computed(() => progress.value?.total ? Math.round(progress.value.done / progress.value.total * 100) : 0);
const progressText = computed(() => !progress.value ? "加载模型…" : `${progress.value.backend === "webgpu" ? "GPU" : "CPU"} ${progress.value.done}/${progress.value.total}`);
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

async function confirm() {
  if (busy.value || props.disabled || tooLarge.value) return;
  busy.value = true;
  progress.value = undefined;
  controller = new AbortController();
  const signal = controller.signal;
  let canvas: HTMLCanvasElement | undefined;
  try {
    const image = await loadImage(props.src);
    canvas = await superResolve(image, scale.value, signal, value => { progress.value = value; });
    const blob = await canvasBlob(canvas);
    signal.throwIfAborted();
    await createDerived(blob, { label: `超分 ×${scale.value}`, width: canvas.width, height: canvas.height }, signal);
    visible.value = false;
  } catch (error) {
    if (!signal.aborted) showNodeError(error, "超分失败");
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.imageSuperResolve {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .resolveField {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fieldLabel {
    color: var(--el-text-color-primary);
    font-size: 13px;
    font-weight: 600;
  }

  .resolveSummary {
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

  .resolveProgress { font-variant-numeric: tabular-nums; }

  .resolveHint {
    margin: -8px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    line-height: 1.6;
  }

  .resolveActions {
    display: flex;
    gap: 8px;

    .confirmButton { flex: 1; }
  }
}
</style>
