<template>
  <div class="canvasBackgroundPicker">
    <div class="pickerHeader">
      <label class="appearanceLabel">组合主题</label>
      <el-button text size="small" :disabled="isDefault" @click="apply(defaultCanvasBackground)">恢复默认</el-button>
    </div>
    <div class="thumbGrid" role="group" aria-label="组合主题">
      <button
        v-for="theme in canvasBackgroundThemes"
        :key="theme.value"
        type="button"
        class="thumbItem"
        :class="{ isActive: sameCanvasBackground(current, theme.settings) }"
        :aria-pressed="sameCanvasBackground(current, theme.settings)"
        :aria-label="`组合主题：${theme.label}`"
        @click="apply(theme.settings)">
        <span class="thumbPreview" :style="previewStyle(dark ? theme.settings.canvasBackgroundDark : theme.settings.canvasBackgroundLight)">
          <canvasBackground :pattern="theme.settings.canvasBackgroundMode" :unit="thumbUnit(theme.settings.canvasBackgroundGap)" :scale="0.8" :opacity="theme.settings.canvasBackgroundOpacity / 100" :vignette="theme.settings.canvasBackgroundVignette" />
        </span>
        <span class="thumbLabel">{{ theme.label }}</span>
      </button>
    </div>

    <label class="appearanceLabel">图案</label>
    <div class="thumbGrid" role="group" aria-label="背景图案">
      <button
        v-for="pattern in canvasBackgroundPatterns"
        :key="pattern.value"
        type="button"
        class="thumbItem"
        :class="{ isActive: current.canvasBackgroundMode === pattern.value }"
        :aria-pressed="current.canvasBackgroundMode === pattern.value"
        :aria-label="`图案：${pattern.label}`"
        @click="apply({ canvasBackgroundMode: pattern.value })">
        <span class="thumbPreview" :style="previewStyle(currentColor)">
          <canvasBackground :pattern="pattern.value" :unit="thumbUnit(current.canvasBackgroundGap)" :scale="0.8" :opacity="Math.max(0.5, current.canvasBackgroundOpacity / 100)" />
        </span>
        <span class="thumbLabel">{{ pattern.label }}</span>
      </button>
    </div>

    <label class="appearanceLabel">{{ dark ? "深色" : "浅色" }}模式底色</label>
    <div class="colorRow" role="group" :aria-label="`${dark ? '深色' : '浅色'}模式底色`">
      <el-tooltip v-for="preset in colorPresets" :key="preset.label" :content="preset.label" placement="top" :showArrow="false" :hideAfter="0">
        <button
          type="button"
          class="colorSwatch"
          :class="{ isActive: currentColor === preset.color }"
          :style="{ background: canvasBackgroundColor(preset.color, dark).bg }"
          :aria-pressed="currentColor === preset.color"
          :aria-label="`底色：${preset.label}`"
          @click="apply({ [colorKey]: preset.color })" />
      </el-tooltip>
      <el-color-picker
        :modelValue="currentColor || canvasBackgroundColor('', dark).bg"
        size="small"
        :predefine="colorPresets.filter(preset => preset.color).map(preset => preset.color)"
        :teleported="false"
        aria-label="自定义底色"
        @change="value => apply({ [colorKey]: typeof value === 'string' ? value : '' })" />
    </div>

    <div v-for="slider in sliders" :key="slider.key" class="sliderRow">
      <span>{{ slider.label }}</span>
      <el-slider
        v-model="sliderValues[slider.key]"
        :min="slider.min"
        :max="slider.max"
        :step="slider.step"
        size="small"
        :aria-label="`图案${slider.label}`"
        @change="value => typeof value === 'number' && apply({ [slider.key]: value })" />
    </div>
    <div class="appearanceSwitch"><span>四周暗角</span><el-switch :modelValue="current.canvasBackgroundVignette" aria-label="四周暗角" @change="value => apply({ canvasBackgroundVignette: value === true })" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watchEffect } from "vue";
import { generalSettings, uiSettings, updateGeneralSettings } from "@/stores/settings";
import canvasBackground from "../panels/canvas/components/canvasBackground.vue";
import {
  canvasBackgroundColor, canvasBackgroundColors, canvasBackgroundPatterns, canvasBackgroundThemes,
  defaultCanvasBackground, normalizeCanvasBackground, sameCanvasBackground, type CanvasBackgroundSettings,
} from "@/lib/canvasBackground";

const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const systemDark = ref(systemTheme.matches);
const updateSystemTheme = (event: MediaQueryListEvent) => { systemDark.value = event.matches; };
systemTheme.addEventListener("change", updateSystemTheme);
onScopeDispose(() => systemTheme.removeEventListener("change", updateSystemTheme));

const dark = computed(() => uiSettings.value.theme === "system" ? systemDark.value : uiSettings.value.theme === "dark");
const current = computed(() => normalizeCanvasBackground(generalSettings.value));
const colorKey = computed(() => dark.value ? "canvasBackgroundDark" as const : "canvasBackgroundLight" as const);
const currentColor = computed(() => current.value[colorKey.value]);
const colorPresets = computed(() => canvasBackgroundColors[dark.value ? "dark" : "light"]);
const isDefault = computed(() => sameCanvasBackground(current.value, defaultCanvasBackground));

// ACT: 滑块松开后才写入设置，拖动中只改本地值，避免每帧触发一次设置保存请求。
const sliders = [
  { key: "canvasBackgroundGap", label: "间距", min: 16, max: 160, step: 4 },
  { key: "canvasBackgroundOpacity", label: "浓度", min: 10, max: 100, step: 1 },
  { key: "canvasBackgroundSize", label: "大小", min: 50, max: 300, step: 10 },
] as const;
const sliderValues = reactive({ canvasBackgroundGap: 0, canvasBackgroundOpacity: 0, canvasBackgroundSize: 0 });
watchEffect(() => {
  for (const slider of sliders) sliderValues[slider.key] = current.value[slider.key];
});

function apply(patch: Partial<CanvasBackgroundSettings>) {
  updateGeneralSettings(patch);
}
// 缩略图按约 1/3 比例展示间距，避免大间距在小预览里看不到图案。
function thumbUnit(gap: number) {
  return Math.max(8, gap / 3);
}
function previewStyle(color: string) {
  const colors = canvasBackgroundColor(color, dark.value);
  return { "--canvasDotColor": colors.dot, "--canvasLineColor": colors.line, background: colors.bg };
}
</script>

<style scoped lang="scss">
.canvasBackgroundPicker {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .pickerHeader { display: flex; align-items: center; justify-content: space-between; }
  .appearanceLabel { color: var(--el-text-color-secondary); font-size: 12px; }

  .thumbGrid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;

    .thumbItem {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 3px;
      border: 1px solid transparent;
      border-radius: var(--ui-radius, 8px);
      background: none;
      color: var(--el-text-color-regular);
      font-size: 11px;
      cursor: pointer;

      &:hover { background: var(--el-fill-color-light); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
      &.isActive { border-color: var(--el-color-primary); color: var(--el-color-primary); }

      .thumbPreview {
        position: relative;
        width: 100%;
        height: 36px;
        overflow: hidden;
        border: 1px solid var(--el-border-color-lighter);
        border-radius: calc(var(--ui-radius, 8px) - 2px);
      }
    }
  }

  .colorRow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    // 选中色块的外圈超出色块 4px，留出内边距避免被弹层滚动容器裁掉。
    padding: 4px;

    .colorSwatch {
      width: 22px;
      height: 22px;
      padding: 0;
      border: 1px solid var(--el-border-color);
      border-radius: 50%;
      cursor: pointer;

      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
      &.isActive { box-shadow: 0 0 0 2px var(--el-bg-color-overlay), 0 0 0 4px var(--el-color-primary); }
    }
  }

  .sliderRow {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;

    span { flex: none; }
    .el-slider { flex: 1; margin-right: 6px; }
  }

  .appearanceSwitch { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 13px; }
}
</style>
