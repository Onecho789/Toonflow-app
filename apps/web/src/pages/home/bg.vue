<template>
  <div class="cosmicBg" aria-hidden="true" :style="{ background: scene.background(isDark) }">
    <canvas ref="softCanvas" class="soft" />
    <canvas ref="crispCanvas" class="crisp" />
    <div class="grain" :style="{ backgroundImage: grainUrl, opacity: scene.grain }" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { uiSettings } from "@/stores/settings";
import { bgScenes, radialBlob, softPad, softScale, type BgView } from "./bgScenes";

// still：工作台等页面只要静态底色、柔光与颗粒，不画粒子、流星和花粉，也不跑动画。
const props = withDefaults(defineProps<{ scrollTop?: number; still?: boolean }>(), { scrollTop: 0, still: false });
const softCanvas = ref<HTMLCanvasElement>();
const crispCanvas = ref<HTMLCanvasElement>();
const grainUrl = ref("");
const isDark = ref(true);
const scene = computed(() => bgScenes[uiSettings.value.background]());
const events = new AbortController();
const pointer = { x: -1000, y: -1000, targetX: -1000, targetY: -1000, strength: 0, targetStrength: 0 };
const view: BgView = { width: 0, height: 0, time: 0, dark: true, pointer: { x: -1000, y: -1000, strength: 0 } };
let softContext: CanvasRenderingContext2D | null = null;
let crispContext: CanvasRenderingContext2D | null = null;
let resizeObserver: ResizeObserver;
let themeObserver: MutationObserver;
let reducedMotion: MediaQueryList;
let animationFrame = 0;
let lastFrame = 0;

function createGrain() {
  // 一次性生成 128px 噪点贴图，交给 CSS 平铺做胶片颗粒，不占用每帧绘制。
  const tile = document.createElement("canvas");
  tile.width = tile.height = 128;
  const tileContext = tile.getContext("2d");
  if (!tileContext) return;
  const noise = tileContext.createImageData(128, 128);
  for (let index = 0; index < noise.data.length; index += 4) {
    const value = Math.random() * 255;
    noise.data[index] = noise.data[index + 1] = noise.data[index + 2] = value;
    noise.data[index + 3] = 22;
  }
  tileContext.putImageData(noise, 0, 0);
  grainUrl.value = `url(${tile.toDataURL()})`;
}

function resize() {
  const soft = softCanvas.value, crisp = crispCanvas.value;
  if (!soft || !crisp || !softContext || !crispContext) return;
  view.width = crisp.clientWidth;
  view.height = crisp.clientHeight;
  if (!view.width || !view.height) return syncAnimation();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  crisp.width = Math.round(view.width * pixelRatio);
  crisp.height = Math.round(view.height * pixelRatio);
  // ACT: 柔光层只画 1/4 分辨率再由 CSS 模糊放大，渐变本就平滑，省下大部分填充开销。
  soft.width = Math.round((view.width + softPad * 2) * softScale);
  soft.height = Math.round((view.height + softPad * 2) * softScale);
  scene.value.init(view);
  syncAnimation();
}

function draw(delta = 0) {
  if (!softContext || !crispContext || !view.width || !view.height) return;
  view.dark = isDark.value;
  view.pointer.x = pointer.x;
  view.pointer.y = pointer.y;
  view.pointer.strength = pointer.strength;
  const pixelRatio = crispCanvas.value!.width / view.width;
  softContext.setTransform(1, 0, 0, 1, 0, 0);
  softContext.clearRect(0, 0, softContext.canvas.width, softContext.canvas.height);
  // ACT: 滚动视差只作用于柔光层；粒子按场景坐标循环，整体平移会让一侧变空。
  softContext.setTransform(softScale, 0, 0, softScale, softPad * softScale, (softPad - props.scrollTop * 0.15) * softScale);
  scene.value.soft(softContext, view);
  if (scene.value.glow && pointer.strength > 0.01) radialBlob(softContext, pointer.x, pointer.y + props.scrollTop * 0.15, 220, scene.value.glow, 0.35 * pointer.strength);
  softContext.globalAlpha = 1;
  softContext.globalCompositeOperation = "source-over";
  crispContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  crispContext.clearRect(0, 0, view.width, view.height);
  if (!props.still) scene.value.crisp(crispContext, view, delta);
  crispContext.globalAlpha = 1;
  crispContext.globalCompositeOperation = "source-over";
}

function tick(timestamp: number) {
  animationFrame = 0;
  if (events.signal.aborted || document.hidden || reducedMotion.matches || !view.width || !view.height) return;
  if (!lastFrame || timestamp - lastFrame >= 1000 / 40) {
    const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.07) : 0;
    view.time += delta;
    lastFrame = timestamp;
    pointer.x += (pointer.targetX - pointer.x) * 0.2;
    pointer.y += (pointer.targetY - pointer.y) * 0.2;
    pointer.strength += (pointer.targetStrength - pointer.strength) * 0.12;
    draw(delta);
  }
  animationFrame = requestAnimationFrame(tick);
}

function syncAnimation() {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  lastFrame = 0;
  draw();
  if (!props.still && view.width && view.height && !document.hidden && !reducedMotion.matches && !events.signal.aborted) {
    animationFrame = requestAnimationFrame(tick);
  }
}

watch(() => props.scrollTop, () => {
  if (!animationFrame) draw();
});

watch(scene, () => {
  if (!view.width || !view.height) return;
  scene.value.init(view);
  draw();
});

onMounted(() => {
  const crisp = crispCanvas.value!;
  softContext = softCanvas.value!.getContext("2d");
  crispContext = crisp.getContext("2d");
  if (!softContext || !crispContext) return;
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  isDark.value = document.documentElement.classList.contains("dark");
  createGrain();
  const options = { passive: true, signal: events.signal };
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(crisp);
  themeObserver = new MutationObserver(() => {
    const dark = document.documentElement.classList.contains("dark");
    if (dark === isDark.value) return;
    isDark.value = dark;
    draw();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const host = crisp.parentElement!.parentElement!;
  host.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || reducedMotion.matches) return;
    const bounds = crisp.getBoundingClientRect();
    pointer.targetX = event.clientX - bounds.left;
    pointer.targetY = event.clientY - bounds.top;
    pointer.targetStrength = 1;
    if (pointer.strength < 0.01) { pointer.x = pointer.targetX; pointer.y = pointer.targetY; }
    if (!props.still) scene.value.move?.(pointer.targetX, pointer.targetY);
  }, options);
  host.addEventListener("pointerleave", () => { pointer.targetStrength = 0; }, options);
  window.addEventListener("blur", () => { pointer.targetStrength = 0; }, options);
  document.addEventListener("visibilitychange", syncAnimation, options);
  reducedMotion.addEventListener("change", () => {
    pointer.strength = pointer.targetStrength = 0;
    syncAnimation();
  }, options);
});

onBeforeUnmount(() => {
  events.abort();
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
});
</script>

<style lang="scss" scoped>
.cosmicBg {
  position: relative;
  overflow: hidden;
  pointer-events: none;

  .soft {
    position: absolute;
    // 与 bgScenes 的 softPad 一致，模糊后的边缘落在可视区外。
    inset: -60px;
    width: calc(100% + 120px);
    height: calc(100% + 120px);
    filter: blur(36px);
  }

  .crisp {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }

  .grain {
    position: absolute;
    inset: 0;
    mix-blend-mode: overlay;
  }
}
</style>
