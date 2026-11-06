<template>
  <div class="canvasBackground" aria-hidden="true">
    <svg class="backgroundPattern" :style="{ opacity }">
      <defs>
        <filter v-if="pattern === 'grain'" :id="`${patternId}-grain`" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.6 -0.3" result="grain" />
          <feFlood :style="{ floodColor: 'var(--canvasDotColor)' }" />
          <feComposite in2="grain" operator="in" />
        </filter>
        <pattern
          v-for="(layer, index) in layers"
          :id="`${patternId}-${index}`"
          :key="index"
          :x="offset.x % layer.width"
          :y="offset.y % layer.height"
          :width="layer.width"
          :height="layer.height"
          patternUnits="userSpaceOnUse">
          <rect v-if="layer.grain" :width="layer.width" :height="layer.height" :filter="`url(#${patternId}-grain)`" />
          <path v-if="layer.path" :d="layer.path" :style="{ stroke: toneColor(layer), strokeWidth: layer.stroke, fill: 'none' }" />
          <circle v-for="([cx, cy, r], dot) in layer.dots" :key="dot" :cx="cx" :cy="cy" :r="r" :style="{ fill: toneColor(layer) }" />
        </pattern>
      </defs>
      <rect v-for="(layer, index) in layers" :key="index" width="100%" height="100%" :fill="`url(#${patternId}-${index})`" />
    </svg>
    <div v-if="vignette" class="backgroundVignette" />
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { backgroundLayers, type BackgroundLayer, type CanvasBackgroundPattern } from "@/lib/canvasBackground";

// unit 为屏幕像素间距；followViewport 时 unit 视为画布间距，在组件内按视口缩放、平移对齐画布坐标。
// 视口只在这里读取，平移缩放时只重绘背景，不触发画布宿主整体重渲染。
const props = withDefaults(defineProps<{
  pattern: CanvasBackgroundPattern;
  unit: number;
  scale?: number;
  opacity?: number;
  followViewport?: boolean;
  vignette?: boolean;
}>(), { scale: 1, opacity: 0.4, followViewport: false, vignette: false });

const patternId = `canvasBackground-${useId()}`;
// 设置页缩略图不在 VueFlow 内，不创建画布状态。
const viewport = props.followViewport ? useVueFlow().viewport : undefined;
const offset = computed(() => ({ x: viewport?.value.x ?? 0, y: viewport?.value.y ?? 0 }));
const layers = computed(() => backgroundLayers(props.pattern, props.unit * (viewport?.value.zoom ?? 1), props.scale));

function toneColor(layer: BackgroundLayer) {
  return layer.tone === "dot" ? "var(--canvasDotColor)" : "var(--canvasLineColor)";
}
</script>

<style scoped lang="scss">
.canvasBackground {
  position: absolute;
  inset: 0;
  pointer-events: none;

  .backgroundPattern {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .backgroundVignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 24%) 100%);
  }
}
</style>
