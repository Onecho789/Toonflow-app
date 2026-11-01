<template>
  <div class="cosmicBg" aria-hidden="true">
    <canvas ref="sceneCanvas" class="scene" />
    <div class="grain" :style="{ backgroundImage: grainUrl }" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

type Particle = { x: number; y: number; depth: number; size: number; hue: number; phase: number; speed: number };
type Streak = { x: number; y: number; length: number; speed: number; life: number; hue: number };

const props = defineProps<{ scrollTop: number }>();
const sceneCanvas = ref<HTMLCanvasElement>();
const grainUrl = ref("");
const events = new AbortController();
// 麦穗金、晨光橙、青蓝、星紫，作为星云与粒子的色相池。
const palette = [42, 28, 192, 262];
// 粒子整体沿此方向缓慢穿梭（左下 → 右上）。
const flow = { x: 0.86, y: -0.5 };
const pointer = { x: -1000, y: -1000, targetX: -1000, targetY: -1000, strength: 0, targetStrength: 0 };
let context: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let streaks: Streak[] = [];
let resizeObserver: ResizeObserver;
let themeObserver: MutationObserver;
let reducedMotion: MediaQueryList;
let animationFrame = 0;
let elapsed = 0;
let lastFrame = 0;
let nextStreakAt = 1.2;
let width = 0;
let height = 0;
let isDark = true;

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickHue() {
  return palette[Math.floor(Math.random() * palette.length)]! + random(-8, 8);
}

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
  const canvas = sceneCanvas.value;
  if (!canvas || !context) return;
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  if (!width || !height) return syncAnimation();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  // ACT: 粒子数按面积估算并封顶 260，大屏也只做 O(n) 绘制；指针连线只在指针附近的粒子间计算。
  const count = Math.min(260, Math.round(width * height / 7000));
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * width, y: Math.random() * height, depth: Math.random() ** 1.6,
    size: random(0.5, 1.6), hue: pickHue(), phase: random(0, Math.PI * 2), speed: random(0.6, 1.4),
  }));
  syncAnimation();
}

function drawNebula() {
  // 三团缓慢漂移的星云光晕，叠加后形成底色的冷暖层次。
  const clouds = [
    { x: 0.78 + Math.sin(elapsed * 0.05) * 0.06, y: 0.22 + Math.cos(elapsed * 0.04) * 0.05, r: 0.55, hue: 38, alpha: 0.3 },
    { x: 0.12 + Math.cos(elapsed * 0.035) * 0.05, y: 0.78 + Math.sin(elapsed * 0.045) * 0.05, r: 0.6, hue: 200, alpha: 0.24 },
    { x: 0.45 + Math.sin(elapsed * 0.03 + 2) * 0.08, y: 0.55 + Math.cos(elapsed * 0.025) * 0.06, r: 0.45, hue: 265, alpha: 0.16 },
  ];
  const size = Math.max(width, height);
  for (const cloud of clouds) {
    const x = cloud.x * width;
    const y = cloud.y * height - props.scrollTop * 0.15;
    const gradient = context!.createRadialGradient(x, y, 0, x, y, cloud.r * size);
    const alpha = isDark ? cloud.alpha : cloud.alpha * 0.55;
    gradient.addColorStop(0, `hsla(${cloud.hue}, 85%, ${isDark ? 55 : 62}%, ${alpha})`);
    gradient.addColorStop(0.5, `hsla(${cloud.hue}, 80%, 50%, ${alpha * 0.35})`);
    gradient.addColorStop(1, `hsla(${cloud.hue}, 80%, 50%, 0)`);
    context!.fillStyle = gradient;
    context!.fillRect(0, 0, width, height);
  }
}

function drawBeams() {
  // 两道从右上斜切的宽光束，亮度缓慢呼吸。
  for (const [index, offset] of [0.32, 0.62].entries()) {
    const pulse = 0.5 + Math.sin(elapsed * 0.4 + index * 2.1) * 0.5;
    const centerX = width * (offset + Math.sin(elapsed * 0.06 + index) * 0.04);
    context!.save();
    context!.translate(centerX, height * 0.5);
    context!.rotate(-0.52);
    const beamWidth = Math.max(width, height) * (0.09 + index * 0.04);
    const gradient = context!.createLinearGradient(-beamWidth, 0, beamWidth, 0);
    const hue = index ? 205 : 40;
    const alpha = (isDark ? 0.1 : 0.06) * (0.5 + pulse * 0.5);
    gradient.addColorStop(0, `hsla(${hue}, 90%, 60%, 0)`);
    gradient.addColorStop(0.5, `hsla(${hue}, 90%, 65%, ${alpha})`);
    gradient.addColorStop(1, `hsla(${hue}, 90%, 60%, 0)`);
    context!.fillStyle = gradient;
    context!.fillRect(-beamWidth, -height * 1.2, beamWidth * 2, height * 2.4);
    context!.restore();
  }
}

function drawParticles(delta: number) {
  const lightness = isDark ? 72 : 45;
  const near: Particle[] = [];
  for (const particle of particles) {
    // 越近的粒子越大、越快，滚动时视差也越明显，形成纵深穿梭感。
    const velocity = (6 + particle.depth * 34) * particle.speed * delta;
    particle.x += flow.x * velocity;
    particle.y += flow.y * velocity;
    const parallax = props.scrollTop * (0.2 + particle.depth * 0.5);
    if (particle.x > width + 20 || particle.y - parallax < -20) {
      // 从左侧或底部重新进场，保持粒子分布均匀。
      const fromBottom = Math.random() < width / (width + height);
      particle.x = fromBottom ? random(-20, width) : -20;
      particle.y = (fromBottom ? height + 20 : random(0, height + 20)) + parallax;
    }
    const x = particle.x;
    const y = particle.y - parallax;
    if (y < -20 || y > height + 20) continue;
    const twinkle = 0.55 + Math.sin(elapsed * 2.2 * particle.speed + particle.phase) * 0.45;
    const distance = pointer.strength > 0.01 ? Math.hypot(x - pointer.x, y - pointer.y) : Infinity;
    const glow = distance < 160 ? (1 - distance / 160) * pointer.strength : 0;
    const radius = particle.size * (0.6 + particle.depth * 1.4) * (1 + glow * 0.8);
    const alpha = Math.min(1, (0.25 + particle.depth * 0.6) * twinkle + glow * 0.6) * (isDark ? 1 : 0.75);
    if (particle.depth > 0.55 || glow > 0.2) {
      const halo = context!.createRadialGradient(x, y, 0, x, y, radius * 5);
      halo.addColorStop(0, `hsla(${particle.hue}, 95%, ${lightness}%, ${alpha * 0.5})`);
      halo.addColorStop(1, `hsla(${particle.hue}, 95%, ${lightness}%, 0)`);
      context!.fillStyle = halo;
      context!.fillRect(x - radius * 5, y - radius * 5, radius * 10, radius * 10);
    }
    context!.fillStyle = `hsla(${particle.hue}, 90%, ${isDark ? 85 : 40}%, ${alpha})`;
    context!.beginPath();
    context!.arc(x, y, radius, 0, Math.PI * 2);
    context!.fill();
    if (glow > 0.05) near.push({ ...particle, y });
  }
  // 指针附近的粒子相互连线，像灵感被串联起来。
  context!.lineWidth = 0.6;
  for (let first = 0; first < near.length; first++) {
    for (let second = first + 1; second < near.length; second++) {
      const a = near[first]!, b = near[second]!;
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (gap > 90) continue;
      context!.strokeStyle = `hsla(${a.hue}, 90%, ${lightness}%, ${(1 - gap / 90) * 0.35 * pointer.strength})`;
      context!.beginPath();
      context!.moveTo(a.x, a.y);
      context!.lineTo(b.x, b.y);
      context!.stroke();
    }
  }
}

function drawStreaks(delta: number) {
  if (elapsed >= nextStreakAt) {
    // 每隔 2.5–6 秒划过一道流光，沿粒子穿梭方向飞出。
    nextStreakAt = elapsed + random(2.5, 6);
    const fromLeft = Math.random() < 0.5;
    streaks.push({ x: fromLeft ? -100 : random(0, width * 0.6), y: fromLeft ? random(height * 0.3, height) : height + 60,
      length: random(120, 260), speed: random(520, 820), life: 0, hue: pickHue() });
  }
  streaks = streaks.filter((streak) => streak.x < width + streak.length && streak.y > -streak.length);
  for (const streak of streaks) {
    streak.x += flow.x * streak.speed * delta;
    streak.y += flow.y * streak.speed * delta;
    streak.life += delta;
    const tailX = streak.x - flow.x * streak.length;
    const tailY = streak.y - flow.y * streak.length;
    const gradient = context!.createLinearGradient(tailX, tailY, streak.x, streak.y);
    const fade = Math.min(1, streak.life * 3);
    gradient.addColorStop(0, `hsla(${streak.hue}, 95%, 70%, 0)`);
    gradient.addColorStop(1, `hsla(${streak.hue}, 95%, ${isDark ? 85 : 50}%, ${0.75 * fade})`);
    context!.strokeStyle = gradient;
    context!.lineWidth = 1.4;
    context!.lineCap = "round";
    context!.beginPath();
    context!.moveTo(tailX, tailY);
    context!.lineTo(streak.x, streak.y);
    context!.stroke();
  }
}

function draw(delta = 0) {
  if (!context || !width || !height) return;
  context.clearRect(0, 0, width, height);
  // 暗色下用加色混合，光与光叠加会更亮；浅色下正常混合，避免发灰。
  context.globalCompositeOperation = isDark ? "lighter" : "source-over";
  drawNebula();
  drawBeams();
  drawParticles(delta);
  drawStreaks(delta);
  context.globalCompositeOperation = "source-over";
}

watch(() => props.scrollTop, () => {
  if (!animationFrame) draw();
});

function tick(timestamp: number) {
  animationFrame = 0;
  if (events.signal.aborted || document.hidden || reducedMotion.matches || !width || !height) return;
  if (!lastFrame || timestamp - lastFrame >= 1000 / 40) {
    const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.07) : 0;
    elapsed += delta;
    lastFrame = timestamp;
    pointer.x += (pointer.targetX - pointer.x) * 0.2;
    pointer.y += (pointer.targetY - pointer.y) * 0.2;
    pointer.strength += (pointer.targetStrength - pointer.strength) * 0.15;
    draw(delta);
  }
  animationFrame = requestAnimationFrame(tick);
}

function syncAnimation() {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  lastFrame = 0;
  draw();
  if (width && height && !document.hidden && !reducedMotion.matches && !events.signal.aborted) {
    animationFrame = requestAnimationFrame(tick);
  }
}

function updateTheme() {
  const dark = document.documentElement.classList.contains("dark");
  if (dark === isDark) return;
  isDark = dark;
  draw();
}

onMounted(() => {
  const canvas = sceneCanvas.value!;
  context = canvas.getContext("2d");
  if (!context) return;
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  isDark = document.documentElement.classList.contains("dark");
  createGrain();
  const options = { passive: true, signal: events.signal };
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const host = canvas.parentElement!.parentElement!;
  host.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || reducedMotion.matches) return;
    const bounds = canvas.getBoundingClientRect();
    pointer.targetX = event.clientX - bounds.left;
    pointer.targetY = event.clientY - bounds.top;
    pointer.targetStrength = 1;
    if (pointer.strength < 0.01) { pointer.x = pointer.targetX; pointer.y = pointer.targetY; }
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

  .scene {
    display: block;
    width: 100%;
    height: 100%;
  }

  .grain {
    position: absolute;
    inset: 0;
    opacity: 0.5;
    mix-blend-mode: overlay;
  }
}
</style>
