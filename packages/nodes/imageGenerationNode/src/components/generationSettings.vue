<template>
  <el-popover v-model:visible="settingsVisible" trigger="click" placement="top-start" width="min(360px, calc(100vw - 24px))" :disabled="disabled" :showArrow="false" popperClass="imageSettingsPopper">
    <template #reference>
      <el-button class="settingsButton" text size="small" :disabled="disabled" :aria-expanded="settingsVisible" aria-label="图片生成设置">
        <span class="ratioShape" :style="ratioStyle(ratio)" aria-hidden="true" />
        <span>{{ summary }}</span>
        <component :is="settingsVisible ? IconChevronDown : IconChevronUp" :size="14" aria-hidden="true" />
      </el-button>
    </template>
    <div class="generationSettings nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop @wheel.stop>
      <section class="settingSection">
        <div class="sectionHead"><span class="sectionLabel">质量</span></div>
        <el-segmented v-model="quality" :options="qualityOptions" :disabled="disabled" block aria-label="图片质量" />
      </section>

      <section class="settingSection">
        <div class="sectionHead">
          <span class="sectionLabel">尺寸</span>
          <el-button v-if="pixels" class="resetButton" link size="small" :disabled="disabled" @click="pixels = ''">恢复档位</el-button>
          <span v-else class="sectionHint">按 16 对齐</span>
        </div>
        <div class="pixelInputs">
          <label class="pixelField">
            <span>W</span>
            <input v-model="widthText" inputmode="numeric" :disabled="disabled" :placeholder="tierPixels[0]" aria-label="宽度像素" @blur="commitPixels" @keydown.enter="commitPixels">
          </label>
          <icon-x :size="14" class="pixelCross" aria-hidden="true" />
          <label class="pixelField">
            <span>H</span>
            <input v-model="heightText" inputmode="numeric" :disabled="disabled" :placeholder="tierPixels[1]" aria-label="高度像素" @blur="commitPixels" @keydown.enter="commitPixels">
          </label>
        </div>
        <div v-if="pixelsError" class="pixelsError" role="alert">{{ pixelsError }}</div>
      </section>

      <section class="settingSection">
        <div class="sectionHead"><span class="sectionLabel">分辨率</span></div>
        <el-segmented :modelValue="pixels ? '' : size" :options="sizes" :disabled="disabled" block aria-label="图片分辨率" @change="selectSize" />
      </section>

      <section class="settingSection">
        <div class="sectionHead"><span class="sectionLabel">宽高比</span></div>
        <div class="ratioOptions" role="group" aria-label="图片宽高比">
          <button
            v-for="item in ratios"
            :key="item"
            type="button"
            class="ratioButton"
            :disabled="disabled"
            :aria-label="`宽高比 ${item}`"
            :aria-pressed="!pixels && ratio === item"
            @click="selectRatio(item)">
            <span class="ratioShape" :style="ratioStyle(item, 18)" aria-hidden="true" />
            <span>{{ item }}</span>
          </button>
        </div>
      </section>

      <section v-if="maxCount > 1" class="settingSection">
        <div class="sectionHead"><span class="sectionLabel">生成张数</span><span class="sectionHint">单次最多 {{ maxCount }} 张</span></div>
        <div class="countOptions" role="group" aria-label="生成张数">
          <button
            v-for="item in quickCount"
            :key="item"
            type="button"
            class="countButton"
            :disabled="disabled"
            :aria-pressed="count === item"
            @click="count = item">{{ item }}</button>
        </div>
        <label v-if="maxCount > quickCount" class="countCustom">
          <span>自定义张数</span>
          <el-input-number v-model="count" :min="1" :max="maxCount" :step="1" stepStrictly :valueOnClear="1" size="small" :disabled="disabled" controlsPosition="right" aria-label="自定义生成张数" />
        </label>
      </section>

      <section class="settingSection switchList">
        <label class="switchOption">
          <span>透明背景</span>
          <el-switch v-model="transparent" size="small" :disabled="disabled" aria-label="透明背景" />
        </label>
        <label class="switchOption">
          <span>完成后拆分为图片节点</span>
          <el-switch v-model="autoSplit" size="small" :disabled="disabled" aria-label="完成后拆分为图片节点" />
        </label>
      </section>

      <modelForm v-model="other" :rules="model?.rules" :disabled="disabled" />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElButton, ElInputNumber, ElPopover, ElSegmented, ElSwitch } from "element-plus";
import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-vue";
import type { NodeMediaModel } from "@toonflow/nodes-scaffold/runtime";
import modelForm from "@toonflow/node-shared/modelForm";

const props = defineProps<{ sizes: string[]; ratios: string[]; model?: NodeMediaModel; disabled?: boolean; maxCount: number }>();
const settingsVisible = ref(false);
const size = defineModel<string>("size", { required: true });
const ratio = defineModel<string>("ratio", { required: true });
const other = defineModel<Record<string, unknown>>("other", { required: true });
const count = defineModel<number>("count", { required: true });
const autoSplit = defineModel<boolean>("autoSplit", { required: true });
const quality = defineModel<string>("quality", { required: true });
const transparent = defineModel<boolean>("transparent", { required: true });
// 自定义像素“宽x高”，空串表示按分辨率档位与比例取像素。
const pixels = defineModel<string>("pixels", { required: true });

// 与 infinite-canvas 一致：前 10 张给快捷按钮，更多张数用数字输入。
const quickCount = computed(() => Math.min(10, props.maxCount));
const qualityOptions = [
  { label: "自动", value: "auto" },
  { label: "高", value: "high" },
  { label: "中", value: "medium" },
  { label: "低", value: "low" },
];
// 与麦麦云 gpt-image 尺寸约束一致：边长 16 的倍数，长边不超过 3840，总像素 655360–8294400。
const pixelStep = 16;
const maxEdge = 3840;
const minArea = 655360;
const maxArea = 8294400;

const tierPixels = computed(() => (props.model?.sizeMap?.[size.value]?.[ratio.value] ?? "").split("x") as [string?, string?]);
const widthText = ref("");
const heightText = ref("");
watch(pixels, value => {
  const [width = "", height = ""] = value ? value.split("x") : [];
  widthText.value = width;
  heightText.value = height;
}, { immediate: true });
const pixelsError = computed(() => {
  if (!pixels.value) return "";
  const [width = 0, height = 0] = pixels.value.split("x").map(Number);
  const area = width * height;
  if (area < minArea) return `总像素不能少于 ${minArea}（约 810×810）`;
  if (area > maxArea) return `总像素不能超过 ${maxArea}（约 3840×2160）`;
  return "";
});
const qualityLabel = computed(() => qualityOptions.find(item => item.value === quality.value)?.label ?? "自动");
const summary = computed(() => [qualityLabel.value, pixels.value ? pixels.value.replace("x", "×") : size.value, pixels.value ? "" : ratio.value, `${count.value} 张`].filter(Boolean).join(" · "));

function alignEdge(text: string, fallback?: string) {
  const value = Number.parseInt(text || fallback || "", 10);
  if (!Number.isFinite(value) || value <= 0) return;
  return Math.min(maxEdge, Math.max(pixelStep, Math.ceil(value / pixelStep) * pixelStep));
}

function commitPixels() {
  if (!widthText.value && !heightText.value) {
    pixels.value = "";
    return;
  }
  // 只填一边时另一边沿用档位像素，与 infinite-canvas 一样向上对齐到 16 的倍数。
  const width = alignEdge(widthText.value, tierPixels.value[0]);
  const height = alignEdge(heightText.value, tierPixels.value[1]);
  const value = width && height ? `${width}x${height}` : "";
  if (value === pixels.value) {
    widthText.value = width ? String(width) : "";
    heightText.value = height ? String(height) : "";
  }
  pixels.value = value;
}

function selectSize(value: string | number | boolean) {
  size.value = String(value);
  pixels.value = "";
}

function selectRatio(value: string) {
  ratio.value = value;
  pixels.value = "";
}

function ratioStyle(value: string, box = 16) {
  const [width = 1, height = 1] = value.split(":").map(Number);
  return { width: `${box * Math.min(width / height, 1)}px`, height: `${box * Math.min(height / width, 1)}px` };
}
</script>

<style lang="scss">
.imageSettingsPopper.el-popover.el-popper {
  max-height: min(640px, calc(100vh - 96px));
  padding: 18px;
  overflow-y: auto;
  border-radius: 16px;
  box-shadow: 0 18px 54px rgb(0 0 0 / 16%);
}
</style>

<style scoped lang="scss">
.ratioShape {
  display: inline-block;
  flex-shrink: 0;
  border: 1.5px solid currentColor;
  border-radius: 3px;
  box-sizing: border-box;
}

.settingsButton {
  flex-shrink: 0;
  :deep(> span) { gap: 6px; }
}

.generationSettings {
  display: flex;
  flex-direction: column;
  gap: 18px;
  text-align: left;

  .sectionHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 20px;
    margin-bottom: 8px;
  }

  .sectionLabel {
    color: var(--el-text-color-primary);
    font-size: 13px;
    font-weight: 600;
  }

  .sectionHint {
    color: var(--el-text-color-placeholder);
    font-size: 12px;
  }

  .resetButton { font-size: 12px; }

  .el-segmented {
    --el-segmented-item-selected-bg-color: var(--el-bg-color);
    --el-segmented-item-selected-color: var(--el-text-color-primary);
    --el-border-radius-base: 10px;
    min-height: 34px;
    padding: 3px;
    :deep(.el-segmented__item-selected) { box-shadow: var(--el-box-shadow-lighter); }
  }

  .pixelInputs {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pixelField {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    background: var(--el-fill-color-blank);
    transition: border-color .15s;

    &:focus-within { border-color: var(--el-color-primary); }

    span {
      color: var(--el-text-color-placeholder);
      font-size: 12px;
      font-weight: 600;
    }

    input {
      width: 100%;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--el-text-color-primary);
      font: inherit;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      &::placeholder { color: var(--el-text-color-secondary); }
      &:disabled { cursor: not-allowed; }
    }
  }

  .pixelCross { flex-shrink: 0; color: var(--el-text-color-placeholder); }

  .pixelsError {
    margin-top: 6px;
    color: var(--el-color-danger);
    font-size: 12px;
  }

  .ratioOptions {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .ratioButton, .countButton {
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-regular);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background-color .15s, border-color .15s, color .15s;

    &:hover:not(:disabled) {
      background: var(--el-fill-color);
      color: var(--el-text-color-primary);
    }

    &[aria-pressed="true"] {
      border-color: var(--el-text-color-primary);
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      font-weight: 600;
    }

    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
    &:disabled { cursor: not-allowed; opacity: .6; }
  }

  .ratioButton {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 58px;
    padding: 6px 4px;
  }

  .countOptions {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .countCustom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
    color: var(--el-text-color-regular);
    font-size: 13px;

    .el-input-number { width: 110px; }
  }

  .countButton {
    height: 32px;
    font-variant-numeric: tabular-nums;
  }

  .switchList {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 12px;
    background: var(--el-fill-color-light);
  }

  .switchOption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;
    color: var(--el-text-color-regular);
    font-size: 13px;
    cursor: pointer;
  }

  :deep(.modelForm) { margin-top: 0; }
}
</style>
