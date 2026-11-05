import type { backgroundStyles } from "@/stores/settings";

// 背景动效分两层：柔光层画在 1/4 分辨率画布上交给 CSS 模糊，清晰层画粒子、星星与流星。
export type BgView = { width: number; height: number; time: number; dark: boolean; pointer: { x: number; y: number; strength: number } };
export type BgScene = {
  background: (dark: boolean) => string;
  grain: number;
  glow?: string;
  init: (view: BgView) => void;
  soft: (c: CanvasRenderingContext2D, view: BgView) => void;
  crisp: (c: CanvasRenderingContext2D, view: BgView, delta: number) => void;
  move?: (x: number, y: number) => void;
};

// 柔光层四周多画的留白（CSS 像素），模糊后边缘不会露出透明；样式里的 -60px 与此一致。
export const softPad = 60;
export const softScale = 0.25;

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;
const hsla = (hue: number, saturation: number, lightness: number, alpha: number) => `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;

// 四角星闪光，用于星光、花粉高光与星尘。
function sparkle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

function glowDot(c: CanvasRenderingContext2D, x: number, y: number, r: number, hue: number, lightness: number, alpha: number, halo = 5) {
  const gradient = c.createRadialGradient(x, y, 0, x, y, r * halo);
  gradient.addColorStop(0, hsla(hue, 95, lightness, alpha * 0.55));
  gradient.addColorStop(1, hsla(hue, 95, lightness, 0));
  c.fillStyle = gradient;
  c.fillRect(x - r * halo, y - r * halo, r * halo * 2, r * halo * 2);
  c.fillStyle = hsla(hue, 95, Math.min(lightness + 15, 96), alpha);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

// color 使用 rgba(r,g,b,1)；渐变终点用同色透明，过渡到黑色透明时边缘会发灰。
export function radialBlob(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const gradient = c.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, color.replace(/,\s*[\d.]+\)$/, ",0)"));
  c.globalAlpha = alpha;
  c.fillStyle = gradient;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.globalAlpha = 1;
}

const pointerNear = (view: BgView, x: number, y: number, range: number) =>
  view.pointer.strength > 0.01 ? Math.max(0, 1 - Math.hypot(x - view.pointer.x, y - view.pointer.y) / range) * view.pointer.strength : 0;

// 晨曦麦浪：底部升起的暖阳、缓慢摆动的光芒和向上飘的金色花粉。
function dawnScene(): BgScene {
  type Pollen = { x: number; y: number; r: number; hue: number; speed: number; sway: number; phase: number; depth: number };
  let pollen: Pollen[] = [];
  const seed = (view: BgView, anywhere: boolean): Pollen => ({
    x: random(0, view.width), y: anywhere ? random(0, view.height) : view.height + 20, r: random(0.6, 2.4),
    hue: Math.random() < 0.18 ? random(335, 350) : random(30, 48), speed: random(10, 34), sway: random(6, 22), phase: random(0, Math.PI * 2), depth: Math.random(),
  });
  return {
    // 深色用暖炭灰入夜，不再铺紫红底，暖阳只在底部留一抹余晖。
    background: dark => dark ? "linear-gradient(180deg,#0f0d0b 0%,#16120f 55%,#231711 100%)" : "linear-gradient(180deg,#fffaf2 0%,#fff0e0 60%,#ffe0cc 100%)",
    grain: 0.4,
    glow: "rgba(255,217,160,1)",
    init(view) {
      // ACT: 花粉数量按面积估算并封顶 170，大屏也只是 O(n) 绘制。
      pollen = Array.from({ length: Math.min(170, Math.round(view.width * view.height / 9000)) }, () => seed(view, true));
    },
    soft(c, { width, height, time, dark }) {
      c.globalCompositeOperation = dark ? "lighter" : "source-over";
      const size = Math.max(width, height);
      const sunX = width * 0.5, sunY = height * 1.06;
      const sun = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, size * 0.75);
      sun.addColorStop(0, "rgba(255,214,130,1)");
      sun.addColorStop(0.3, "rgba(255,154,98,0.75)");
      sun.addColorStop(0.6, "rgba(255,111,145,0.3)");
      sun.addColorStop(1, "rgba(255,111,145,0)");
      c.globalAlpha = (dark ? 0.38 : 0.5) * (0.85 + 0.15 * Math.sin(time * 0.6));
      c.fillStyle = sun;
      c.fillRect(-softPad, -softPad, width + softPad * 2, height + softPad * 2);
      // 太阳放射出的光芒，缓慢摆动、明暗交替。
      c.save();
      c.translate(sunX, sunY);
      c.rotate(Math.sin(time * 0.08) * 0.12);
      c.fillStyle = "rgba(255,226,170,1)";
      for (let index = 0; index < 9; index++) {
        const angle = -Math.PI * (0.12 + index * 0.095);
        c.globalAlpha = (dark ? 0.06 : 0.12) * (0.6 + 0.4 * Math.sin(time * 0.7 + index * 1.7));
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(angle - 0.025) * size * 1.3, Math.sin(angle - 0.025) * size * 1.3);
        c.lineTo(Math.cos(angle + 0.025) * size * 1.3, Math.sin(angle + 0.025) * size * 1.3);
        c.closePath();
        c.fill();
      }
      c.restore();
      radialBlob(c, width * (0.15 + Math.sin(time * 0.05) * 0.05), height * 0.2, size * 0.4, "rgba(255,143,177,1)", dark ? 0.08 : 0.2);
      radialBlob(c, width * (0.85 + Math.cos(time * 0.04) * 0.05), height * 0.25, size * 0.38, "rgba(183,156,255,1)", dark ? 0.06 : 0.18);
    },
    crisp(c, view, delta) {
      c.globalCompositeOperation = view.dark ? "lighter" : "source-over";
      for (const [index, item] of pollen.entries()) {
        item.y -= item.speed * (0.5 + item.depth) * delta;
        if (item.y < -20) pollen[index] = seed(view, false);
        const x = item.x + Math.sin(view.time * 0.6 + item.phase) * item.sway;
        const near = pointerNear(view, x, item.y, 150);
        const alpha = (0.35 + 0.5 * item.depth) * (0.6 + 0.4 * Math.sin(view.time * 2 + item.phase)) + near * 0.5;
        const r = item.r * (0.7 + item.depth) * (1 + near * 0.6);
        glowDot(c, x, item.y, r, item.hue, view.dark ? 70 : 52, Math.min(1, alpha) * (view.dark ? 1 : 0.8));
        if (item.depth > 0.85) {
          c.fillStyle = `rgba(255,248,225,${alpha * 0.8})`;
          sparkle(c, x, item.y, r * 3.2);
        }
      }
    },
  };
}

// 深色流星许愿的静态星空：藏蓝夜空、由底部粉紫斜升到右上蓝紫的云纹银河、暗尘带与密集星点。
// ACT: 首次用到时在 1920×1200 离屏画布画一次并缓存为图片，按 cover 铺满；超大屏会略微放大，以后可按屏幕尺寸分档生成。
let meteorSky = "";
function meteorSkyImage() {
  if (meteorSky) return meteorSky;
  const width = 1920, height = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d");
  if (!c) return "";
  const base = c.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#03041a");
  base.addColorStop(0.55, "#0b0c35");
  base.addColorStop(1, "#1c1442");
  c.fillStyle = base;
  c.fillRect(0, 0, width, height);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  // 银河沿一条从底部中间升到右上的曲线，t=0 在底部偏粉，t=1 在顶部偏蓝。
  const band = (t: number) => {
    const x = width * (0.46 + 0.26 * t + 0.05 * Math.sin(t * Math.PI * 1.6)), y = height * (1.08 - 1.16 * t);
    const dx = width * 0.26 + width * 0.05 * Math.PI * 1.6 * Math.cos(t * Math.PI * 1.6), dy = -height * 1.16;
    const length = Math.hypot(dx, dy);
    return { x, y, nx: -dy / length, ny: dx / length, spread: width * (0.3 - 0.08 * t) };
  };
  c.globalCompositeOperation = "lighter";
  radialBlob(c, width * 0.22, height * 0.12, width * 0.28, "rgba(60,90,200,1)", 0.22);
  radialBlob(c, width * 0.47, height * 1.12, width * 0.5, "rgba(255,140,205,1)", 0.4);
  radialBlob(c, width * 0.6, height * 0.5, width * 0.4, "rgba(110,90,230,1)", 0.22);
  radialBlob(c, width * 0.68, height * 0.15, width * 0.25, "rgba(90,100,255,1)", 0.25);
  for (let index = 0; index < 1400; index++) {
    const t = Math.random(), point = band(t), offset = gauss() * point.spread;
    const hue = 325 - t * 92 + random(-12, 12);
    const r = random(18, 85) * (1.15 - Math.abs(offset) / point.spread * 0.6);
    radialBlob(c, point.x + point.nx * offset, point.y + point.ny * offset, r, hsla(hue, 80, random(62, 78), 1), random(0.03, 0.075));
  }
  // 云团内的小亮结，让银河呈现棉絮般的纹理。
  for (let index = 0; index < 500; index++) {
    const t = Math.random(), point = band(t), offset = gauss() * point.spread * 0.8;
    radialBlob(c, point.x + point.nx * offset, point.y + point.ny * offset, random(5, 18), hsla(325 - t * 92, 70, 82, 1), random(0.06, 0.14));
  }
  // 暗尘带沿银河中线略偏一侧，切出深色裂隙。
  c.globalCompositeOperation = "source-over";
  for (let index = 0; index < 420; index++) {
    const t = random(0.08, 0.9), point = band(t), offset = (gauss() * 0.35 - 0.12) * point.spread;
    radialBlob(c, point.x + point.nx * offset, point.y + point.ny * offset, random(10, 46), "rgba(8,8,32,1)", random(0.08, 0.2));
  }
  // 星点：全屏均匀铺一层，银河内再加密一层；少数亮星带光晕。
  c.globalCompositeOperation = "lighter";
  const star = (x: number, y: number) => {
    const r = Math.random() ** 3 * 1.3 + 0.35;
    const tint = pick(["255,255,255", "255,255,255", "215,225,255", "255,215,240"]);
    c.fillStyle = `rgba(${tint},${random(0.45, 1)})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    if (r > 1.35) radialBlob(c, x, y, r * 4, `rgba(${tint},1)`, 0.35);
  };
  for (let index = 0; index < 2600; index++) star(random(0, width), random(0, height));
  for (let index = 0; index < 1400; index++) {
    const t = Math.random(), point = band(t), offset = gauss() * point.spread;
    star(point.x + point.nx * offset, point.y + point.ny * offset);
  }
  // 银河里一颗带十字星芒的亮星。
  const brightX = width * 0.62, brightY = height * 0.4;
  radialBlob(c, brightX, brightY, 60, "rgba(220,215,255,1)", 0.55);
  radialBlob(c, brightX, brightY, 12, "rgba(255,255,255,1)", 1);
  for (const [dx, dy, length] of [[1, 0, 150], [0, 1, 110]] as const) {
    const flare = c.createLinearGradient(brightX - dx * length, brightY - dy * length, brightX + dx * length, brightY + dy * length);
    flare.addColorStop(0, "rgba(220,215,255,0)");
    flare.addColorStop(0.5, "rgba(240,238,255,0.7)");
    flare.addColorStop(1, "rgba(220,215,255,0)");
    c.fillStyle = flare;
    c.fillRect(brightX - dx * length - dy, brightY - dy * length - dx, dx * length * 2 + dy * 2, dy * length * 2 + dx * 2);
  }
  meteorSky = canvas.toDataURL("image/webp", 0.92);
  return meteorSky;
}

// 流星许愿：深色为静态银河星空，浅色为淡彩晨空；流星不时划过洒下星尘，指针移动也会留下星尘。
function meteorScene(): BgScene {
  type Star = { x: number; y: number; r: number; phase: number; speed: number; tone: number };
  type Meteor = { x: number; y: number; dx: number; dy: number; speed: number; length: number; life: number };
  type Dust = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; hue: number };
  let stars: Star[] = [];
  let meteors: Meteor[] = [];
  let dust: Dust[] = [];
  let nextMeteor = 1;
  return {
    background: dark => dark ? `url(${meteorSkyImage()}) center / cover no-repeat, #05061c` : "linear-gradient(180deg,#e9eeff 0%,#f3eaff 55%,#ffe6f1 100%)",
    grain: 0.35,
    init({ width, height, time }) {
      stars = Array.from({ length: Math.min(420, Math.round(width * height / 4200)) }, () => ({
        x: random(0, width), y: random(0, height), r: random(0.3, 1.4), phase: random(0, Math.PI * 2), speed: random(0.4, 1.8), tone: pick([0, 0, 0, 1, 2]),
      }));
      meteors = [];
      dust = [];
      nextMeteor = time + 1;
    },
    move(x, y) {
      // ACT: 星尘只在寿命内存活（约 1 秒），快速移动时数量自然封顶在几百个以内。
      for (let index = 0; index < 2; index++) {
        dust.push({ x: x + random(-4, 4), y: y + random(-4, 4), vx: random(-20, 20), vy: random(-30, 10), life: 0, max: random(0.7, 1.3), r: random(1.5, 3.5), hue: pick([45, 330, 200, 270]) });
      }
    },
    soft(c, { width, height, time, dark }) {
      const size = Math.max(width, height);
      if (dark) {
        // 星空图是静态的，这里只让银河核心和底部粉光缓慢呼吸。
        c.globalCompositeOperation = "lighter";
        radialBlob(c, width * 0.6, height * 0.45, size * 0.3, "rgba(130,110,255,1)", 0.08 + Math.sin(time * 0.4) * 0.04);
        radialBlob(c, width * 0.48, height * 1.05, size * 0.35, "rgba(255,140,210,1)", 0.08 + Math.sin(time * 0.3 + 1) * 0.04);
        return;
      }
      const horizon = c.createRadialGradient(width * 0.5, height * 1.15, 0, width * 0.5, height * 1.15, size * 0.8);
      horizon.addColorStop(0, "rgba(255,126,182,1)");
      horizon.addColorStop(0.45, "rgba(124,92,255,0.45)");
      horizon.addColorStop(1, "rgba(124,92,255,0)");
      c.globalAlpha = 0.4 * (0.9 + 0.1 * Math.sin(time * 0.5));
      c.fillStyle = horizon;
      c.fillRect(-softPad, -softPad, width + softPad * 2, height + softPad * 2);
      // 斜挂的银河带。
      c.save();
      c.translate(width * 0.55, height * 0.4);
      c.rotate(-0.55);
      c.scale(1, 0.18);
      radialBlob(c, 0, 0, size * 0.7, "rgba(160,130,255,1)", 0.16);
      c.restore();
    },
    crisp(c, { width, height, time, dark }, delta) {
      const tones = dark ? ["255,255,255", "255,230,160", "170,215,255"] : ["120,100,220", "220,150,60", "80,140,230"];
      c.globalCompositeOperation = "source-over";
      for (const [index, star] of stars.entries()) {
        // 深色星空图里已有密集静态星点，动态闪烁星只画三分之一。
        if (dark && index % 3) continue;
        const alpha = (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 1.6 * star.speed + star.phase))) * (dark ? 1 : 0.5);
        c.fillStyle = `rgba(${tones[star.tone]},${alpha})`;
        c.beginPath();
        c.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        c.fill();
        if (star.r > 1.25) sparkle(c, star.x, star.y, star.r * 3 * alpha);
      }
      if (delta && time >= nextMeteor) {
        nextMeteor = time + random(1.2, 3.5);
        const angle = random(0.45, 0.7);
        meteors.push({ x: random(width * 0.35, width * 1.1), y: random(-height * 0.1, height * 0.35), dx: -Math.cos(angle), dy: Math.sin(angle), speed: random(650, 1000), length: random(150, 280), life: 0 });
      }
      c.globalCompositeOperation = dark ? "lighter" : "source-over";
      meteors = meteors.filter(meteor => meteor.life < 1.8 && meteor.x > -meteor.length && meteor.y < height + meteor.length);
      for (const meteor of meteors) {
        meteor.x += meteor.dx * meteor.speed * delta;
        meteor.y += meteor.dy * meteor.speed * delta;
        meteor.life += delta;
        const fade = Math.min(1, meteor.life * 4) * Math.max(0, 1 - meteor.life / 1.8);
        const tailX = meteor.x - meteor.dx * meteor.length, tailY = meteor.y - meteor.dy * meteor.length;
        const tail = c.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
        tail.addColorStop(0, dark ? "rgba(255,126,182,0)" : "rgba(160,90,220,0)");
        tail.addColorStop(1, dark ? `rgba(255,245,220,${fade})` : `rgba(140,80,220,${fade * 0.8})`);
        c.strokeStyle = tail;
        c.lineWidth = 1.8;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(tailX, tailY);
        c.lineTo(meteor.x, meteor.y);
        c.stroke();
        glowDot(c, meteor.x, meteor.y, 1.6, 45, dark ? 88 : 60, fade, 6);
        if (Math.random() < 0.6) dust.push({ x: meteor.x, y: meteor.y, vx: random(-15, 15), vy: random(5, 30), life: 0, max: random(0.5, 1), r: random(1, 2.4), hue: pick([45, 330, 200]) });
      }
      dust = dust.filter(item => item.life < item.max);
      for (const item of dust) {
        item.life += delta;
        item.x += item.vx * delta;
        item.y += item.vy * delta;
        item.vy += 30 * delta;
        const alpha = 1 - item.life / item.max;
        c.fillStyle = hsla(item.hue, 100, dark ? 82 : 58, alpha);
        sparkle(c, item.x, item.y, item.r * (0.5 + alpha));
      }
    },
  };
}

// 星云穿梭：原背景的斜向穿梭粒子、呼吸光束与流光，配色换成玫瑰粉、薰衣草紫、天空蓝与麦穗金。
function nebulaScene(): BgScene {
  type Particle = { x: number; y: number; depth: number; size: number; hue: number; phase: number; speed: number };
  type Streak = { x: number; y: number; length: number; speed: number; life: number; hue: number };
  const hues = [335, 265, 200, 42];
  const flow = { x: 0.86, y: -0.5 };
  let particles: Particle[] = [];
  let streaks: Streak[] = [];
  let nextStreak = 1.2;
  return {
    // 深色用近中性的石墨底，星云与光束减半，颜色只作点缀。
    background: dark => dark ? "radial-gradient(130% 100% at 50% 0%,#15141d 0%,#0d0d13 45%,#08080c 100%)" : "radial-gradient(130% 100% at 50% 0%,#ffffff 0%,#f6f2ff 50%,#eef3ff 100%)",
    grain: 0.35,
    glow: "rgba(201,181,255,1)",
    init({ width, height, time }) {
      // ACT: 粒子数按面积估算并封顶 260；指针连线只在指针附近的粒子间计算。
      particles = Array.from({ length: Math.min(260, Math.round(width * height / 7000)) }, () => ({
        x: random(0, width), y: random(0, height), depth: Math.random() ** 1.6, size: random(0.5, 1.6), hue: pick(hues) + random(-8, 8), phase: random(0, Math.PI * 2), speed: random(0.6, 1.4),
      }));
      streaks = [];
      nextStreak = time + 1.2;
    },
    soft(c, { width, height, time, dark }) {
      c.globalCompositeOperation = dark ? "lighter" : "source-over";
      const size = Math.max(width, height);
      const clouds = [
        { x: 0.8 + Math.sin(time * 0.05) * 0.06, y: 0.2 + Math.cos(time * 0.04) * 0.05, r: 0.55, color: "rgba(255,126,179,1)", alpha: 0.34 },
        { x: 0.12 + Math.cos(time * 0.035) * 0.05, y: 0.8 + Math.sin(time * 0.045) * 0.05, r: 0.6, color: "rgba(92,200,255,1)", alpha: 0.3 },
        { x: 0.45 + Math.sin(time * 0.03 + 2) * 0.08, y: 0.55 + Math.cos(time * 0.025) * 0.06, r: 0.5, color: "rgba(157,123,255,1)", alpha: 0.28 },
        { x: 0.3 + Math.cos(time * 0.04 + 1) * 0.05, y: 0.15, r: 0.3, color: "rgba(255,210,122,1)", alpha: 0.16 },
      ];
      for (const cloud of clouds) radialBlob(c, cloud.x * width, cloud.y * height, cloud.r * size, cloud.color, cloud.alpha * (dark ? 0.5 : 0.7));
      // 标题后方的柔光，让视线先落在中间。
      if (dark) radialBlob(c, width * 0.5, height * 0.32, size * 0.32, "rgba(255,236,250,1)", 0.06 + Math.sin(time * 0.5) * 0.02);
      // 两道斜切光束，亮度缓慢呼吸。
      for (const [index, [offset, color]] of ([[0.32, "255,150,200"], [0.64, "120,200,255"]] as const).entries()) {
        const pulse = 0.5 + Math.sin(time * 0.4 + index * 2.1) * 0.5;
        const beam = size * (0.09 + index * 0.04);
        c.save();
        c.translate(width * (offset + Math.sin(time * 0.06 + index) * 0.04), height * 0.5);
        c.rotate(-0.52);
        const gradient = c.createLinearGradient(-beam, 0, beam, 0);
        gradient.addColorStop(0, `rgba(${color},0)`);
        gradient.addColorStop(0.5, `rgba(${color},1)`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        c.globalAlpha = (dark ? 0.07 : 0.1) * (0.5 + pulse * 0.5);
        c.fillStyle = gradient;
        c.fillRect(-beam, -height * 1.2, beam * 2, height * 2.4);
        c.restore();
      }
      c.globalAlpha = 1;
    },
    crisp(c, view, delta) {
      const { width, height, time, dark } = view;
      c.globalCompositeOperation = dark ? "lighter" : "source-over";
      const near: Particle[] = [];
      for (const particle of particles) {
        // 越近的粒子越大、越快，形成纵深穿梭感；出界后从左侧或底部重新进场。
        const velocity = (6 + particle.depth * 34) * particle.speed * delta;
        particle.x += flow.x * velocity;
        particle.y += flow.y * velocity;
        if (particle.x > width + 20 || particle.y < -20) {
          const fromBottom = Math.random() < width / (width + height);
          particle.x = fromBottom ? random(-20, width) : -20;
          particle.y = fromBottom ? height + 20 : random(0, height + 20);
        }
        const twinkle = 0.55 + Math.sin(time * 2.2 * particle.speed + particle.phase) * 0.45;
        const glow = pointerNear(view, particle.x, particle.y, 160);
        const r = particle.size * (0.6 + particle.depth * 1.4) * (1 + glow * 0.8);
        const alpha = Math.min(1, (0.3 + particle.depth * 0.6) * twinkle + glow * 0.6) * (dark ? 1 : 0.8);
        if (particle.depth > 0.55 || glow > 0.2) glowDot(c, particle.x, particle.y, r, particle.hue, dark ? 78 : 58, alpha);
        else {
          c.fillStyle = hsla(particle.hue, 90, dark ? 86 : 52, alpha);
          c.beginPath();
          c.arc(particle.x, particle.y, r, 0, Math.PI * 2);
          c.fill();
        }
        if (glow > 0.05) near.push(particle);
      }
      // 指针附近的粒子相互连线，像灵感被串联起来。
      c.lineWidth = 0.6;
      for (let first = 0; first < near.length; first++) {
        for (let second = first + 1; second < near.length; second++) {
          const a = near[first]!, b = near[second]!;
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          if (gap > 90) continue;
          c.strokeStyle = hsla(a.hue, 90, dark ? 78 : 55, (1 - gap / 90) * 0.4 * view.pointer.strength);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
      }
      if (delta && time >= nextStreak) {
        // 每隔 2.5–6 秒划过一道流光，沿粒子穿梭方向飞出。
        nextStreak = time + random(2.5, 6);
        const fromLeft = Math.random() < 0.5;
        streaks.push({ x: fromLeft ? -100 : random(0, width * 0.6), y: fromLeft ? random(height * 0.3, height) : height + 60, length: random(120, 260), speed: random(520, 820), life: 0, hue: pick(hues) });
      }
      streaks = streaks.filter(streak => streak.x < width + streak.length && streak.y > -streak.length);
      for (const streak of streaks) {
        streak.x += flow.x * streak.speed * delta;
        streak.y += flow.y * streak.speed * delta;
        streak.life += delta;
        const tailX = streak.x - flow.x * streak.length, tailY = streak.y - flow.y * streak.length;
        const gradient = c.createLinearGradient(tailX, tailY, streak.x, streak.y);
        gradient.addColorStop(0, hsla(streak.hue, 95, 72, 0));
        gradient.addColorStop(1, hsla(streak.hue, 95, dark ? 88 : 55, 0.8 * Math.min(1, streak.life * 3)));
        c.strokeStyle = gradient;
        c.lineWidth = 1.4;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(tailX, tailY);
        c.lineTo(streak.x, streak.y);
        c.stroke();
      }
    },
  };
}

export const bgScenes: Record<(typeof backgroundStyles)[number], () => BgScene> = { dawn: dawnScene, meteor: meteorScene, nebula: nebulaScene };
