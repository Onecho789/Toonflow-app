<template>
  <div class="ratioPicker" role="radiogroup" :aria-label="label">
    <button
      v-for="item in options"
      :key="item"
      type="button"
      class="ratioItem"
      :class="{ active: item === modelValue }"
      role="radio"
      :aria-checked="item === modelValue"
      :disabled="disabled"
      @click="emit('update:modelValue', item)">
      <span v-if="item !== 'auto'" class="ratioShape" :style="shapeStyle(item)" aria-hidden="true" />
      <span class="ratioText">{{ item === "auto" ? "自动" : item }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string; options: string[]; label: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

// 按比例画出示意框，长边固定 18px；auto 只显示“自动”文字，其他无法解析的写法显示为正方形。
function shapeStyle(ratio: string) {
  const [width, height] = ratio.split(/[:x]/).map(Number);
  if (!width || !height) return { width: "14px", height: "14px" };
  const scale = 18 / Math.max(width, height);
  return { width: `${Math.max(6, width * scale)}px`, height: `${Math.max(6, height * scale)}px` };
}
</script>

<style lang="scss" scoped>
.ratioPicker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;

  .ratioItem {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 58px;
    padding: 0;
    border: 1px solid var(--el-border-color);
    border-radius: var(--ui-radius);
    background: var(--el-fill-color-blank);
    color: var(--el-text-color-regular);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s, color 0.15s;

    .ratioShape {
      display: block;
      border: 1.5px solid currentcolor;
      border-radius: 3px;
    }

    .ratioText { font-size: 12px; line-height: 1; font-variant-numeric: tabular-nums; }

    &:hover:not(:disabled) { border-color: var(--el-color-primary-light-5); color: var(--el-text-color-primary); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    &:disabled { cursor: not-allowed; opacity: 0.55; }

    &.active {
      border-color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      font-weight: 600;

      .ratioShape { background: color-mix(in srgb, var(--el-color-primary) 18%, transparent); }
    }

    @media (prefers-reduced-motion: reduce) { transition: none; }
  }
}
</style>
