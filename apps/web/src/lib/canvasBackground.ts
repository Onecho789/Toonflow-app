// 画布背景：图案、底色预设与组合主题，全局统一保存在 generalSettings。图案颜色按底色亮度自动取深浅。
export const canvasBackgroundPatterns = [
  { value: "dots", label: "点阵" },
  { value: "lines", label: "网格" },
  { value: "blank", label: "空白" },
  { value: "denseDots", label: "细点" },
  { value: "cross", label: "十字" },
  { value: "graph", label: "工程纸" },
  { value: "isometric", label: "等距" },
  { value: "diagonal", label: "斜线" },
  { value: "hexagon", label: "蜂巢" },
  { value: "stars", label: "星点" },
  { value: "grain", label: "纸纹" },
] as const;
export type CanvasBackgroundPattern = (typeof canvasBackgroundPatterns)[number]["value"];

export const defaultCanvasBackground = {
  canvasBackgroundMode: "dots" as CanvasBackgroundPattern,
  canvasBackgroundLight: "",
  canvasBackgroundDark: "",
  canvasBackgroundGap: 48,
  canvasBackgroundOpacity: 40,
  canvasBackgroundSize: 100,
  canvasBackgroundVignette: false,
};
export type CanvasBackgroundSettings = typeof defaultCanvasBackground;

// 空字符串表示沿用主题默认底色。
export const canvasBackgroundColors = {
  light: [
    { label: "默认", color: "" },
    { label: "暖白", color: "#faf7f0" },
    { label: "米纸", color: "#f1e9d8" },
    { label: "雾灰", color: "#e9eaec" },
    { label: "浅薄荷", color: "#e4f1ea" },
    { label: "淡蓝", color: "#e6edf7" },
    { label: "浅杏", color: "#f7e8dc" },
    { label: "淡紫", color: "#eeeaf5" },
  ],
  dark: [
    { label: "默认", color: "" },
    { label: "炭黑", color: "#111111" },
    { label: "午夜蓝", color: "#121a2b" },
    { label: "墨绿", color: "#13221c" },
    { label: "深棕", color: "#221a14" },
    { label: "深紫灰", color: "#1d1a24" },
    { label: "石板", color: "#1e2328" },
    { label: "酒红", color: "#2a1619" },
  ],
};

function theme(label: string, value: string, settings: Partial<CanvasBackgroundSettings>) {
  return { label, value, settings: { ...defaultCanvasBackground, ...settings } };
}
// 组合主题同时设置浅色与深色底色，固定配色的主题两种模式一致。
export const canvasBackgroundThemes = [
  theme("默认", "default", {}),
  theme("极简", "minimal", { canvasBackgroundMode: "blank" }),
  theme("蓝图", "blueprint", { canvasBackgroundMode: "graph", canvasBackgroundLight: "#1d4f91", canvasBackgroundDark: "#173f74", canvasBackgroundOpacity: 70 }),
  theme("黑板", "chalkboard", { canvasBackgroundMode: "dots", canvasBackgroundLight: "#24352c", canvasBackgroundDark: "#1b2822", canvasBackgroundGap: 32, canvasBackgroundOpacity: 55, canvasBackgroundSize: 120, canvasBackgroundVignette: true }),
  theme("牛皮纸", "kraft", { canvasBackgroundMode: "grain", canvasBackgroundLight: "#c9a87b", canvasBackgroundDark: "#3a2e20", canvasBackgroundOpacity: 70 }),
  theme("夜空", "night", { canvasBackgroundMode: "stars", canvasBackgroundLight: "#0b1226", canvasBackgroundDark: "#0b1226", canvasBackgroundOpacity: 85, canvasBackgroundVignette: true }),
  theme("工程纸", "engineering", { canvasBackgroundMode: "graph", canvasBackgroundLight: "#f1f5ee", canvasBackgroundDark: "#1a201c", canvasBackgroundOpacity: 55 }),
  theme("方格本", "notebook", { canvasBackgroundMode: "lines", canvasBackgroundLight: "#fbfaf5", canvasBackgroundDark: "#1c1b19", canvasBackgroundGap: 24, canvasBackgroundOpacity: 50 }),
  theme("蜂巢", "honeycomb", { canvasBackgroundMode: "hexagon", canvasBackgroundLight: "#f6f0e2", canvasBackgroundDark: "#1d1a14", canvasBackgroundOpacity: 45 }),
  theme("等距", "isometric", { canvasBackgroundMode: "isometric", canvasBackgroundOpacity: 45 }),
  theme("宣纸", "ricePaper", { canvasBackgroundMode: "grain", canvasBackgroundLight: "#f3eee2", canvasBackgroundDark: "#201e1a", canvasBackgroundOpacity: 55, canvasBackgroundVignette: true }),
  theme("深海", "deepSea", { canvasBackgroundMode: "denseDots", canvasBackgroundLight: "#0f2a33", canvasBackgroundDark: "#0c2129", canvasBackgroundOpacity: 50, canvasBackgroundVignette: true }),
];

const hexColor = /^#[\da-f]{6}$/i;
function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

export function normalizeCanvasBackground(general: Record<string, unknown>): CanvasBackgroundSettings {
  const color = (value: unknown) => typeof value === "string" && hexColor.test(value) ? value.toLowerCase() : "";
  return {
    canvasBackgroundMode: canvasBackgroundPatterns.find(pattern => pattern.value === general.canvasBackgroundMode)?.value ?? defaultCanvasBackground.canvasBackgroundMode,
    canvasBackgroundLight: color(general.canvasBackgroundLight),
    canvasBackgroundDark: color(general.canvasBackgroundDark),
    canvasBackgroundGap: clampNumber(general.canvasBackgroundGap, 16, 160, defaultCanvasBackground.canvasBackgroundGap),
    canvasBackgroundOpacity: clampNumber(general.canvasBackgroundOpacity, 10, 100, defaultCanvasBackground.canvasBackgroundOpacity),
    canvasBackgroundSize: clampNumber(general.canvasBackgroundSize, 50, 300, defaultCanvasBackground.canvasBackgroundSize),
    canvasBackgroundVignette: general.canvasBackgroundVignette === true,
  };
}

export function sameCanvasBackground(left: CanvasBackgroundSettings, right: CanvasBackgroundSettings) {
  return (Object.keys(defaultCanvasBackground) as (keyof CanvasBackgroundSettings)[]).every(key => left[key] === right[key]);
}

// 亮底用深色半透明图案，暗底用浅色半透明图案；阈值取相对亮度 0.18（约为感知中灰）。
function patternTones(color: string) {
  const [red, green, blue] = [1, 3, 5].map(index => {
    const channel = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.18
    ? { dot: "rgb(40 36 32 / 30%)", line: "rgb(40 36 32 / 14%)" }
    : { dot: "rgb(255 255 255 / 30%)", line: "rgb(255 255 255 / 13%)" };
}

// 默认底色与图案色沿用原 infinite-canvas 配色，保证老用户观感不变。
const defaultColors = {
  light: { bg: "#f4f2ed", dot: "rgb(68 64 60 / 28%)", line: "rgb(68 64 60 / 12%)" },
  dark: { bg: "#181715", dot: "rgb(245 245 244 / 24%)", line: "rgb(245 245 244 / 10%)" },
};
export function canvasBackgroundColor(color: string, dark: boolean) {
  return color ? { bg: color, ...patternTones(color) } : defaultColors[dark ? "dark" : "light"];
}

// 浅色、深色两套变量同时输出，由画布样式按 html.dark 选取。
export function canvasBackgroundVars(settings: Pick<CanvasBackgroundSettings, "canvasBackgroundLight" | "canvasBackgroundDark">) {
  const vars: Record<string, string> = {};
  for (const [mode, color, dark] of [["Light", settings.canvasBackgroundLight, false], ["Dark", settings.canvasBackgroundDark, true]] as const) {
    const colors = canvasBackgroundColor(color, dark);
    vars[`--canvasBg${mode}`] = colors.bg;
    vars[`--canvasDot${mode}`] = colors.dot;
    vars[`--canvasLine${mode}`] = colors.line;
  }
  return vars;
}

export interface BackgroundLayer {
  width: number;
  height: number;
  tone: "dot" | "line";
  path?: string;
  stroke?: number;
  dots?: [number, number, number][];
  // 纸纹按固定屏幕尺寸平铺，不随缩放变化。
  grain?: boolean;
}

const stars: [number, number, number][] = [
  [0.12, 0.18, 1.4], [0.42, 0.07, 0.8], [0.7, 0.3, 1.1], [0.9, 0.62, 0.7], [0.3, 0.55, 1],
  [0.55, 0.8, 1.6], [0.08, 0.86, 0.6], [0.82, 0.92, 0.9], [0.6, 0.5, 0.5], [0.22, 0.32, 0.5],
];

function corners(width: number, height: number) {
  return [[0, 0], [width, 0], [0, height], [width, height]] as const;
}
// 线条落在图块边缘时两侧图块各画一半，合起来是完整线宽。
function gridPath(width: number, height: number) {
  return `M0 0V${height}M${width} 0V${height}M0 0H${width}M0 ${height}H${width}`;
}

// unit 为当前缩放下的屏幕间距，scale 为图案大小倍率。
export function backgroundLayers(pattern: CanvasBackgroundPattern, unit: number, scale: number): BackgroundLayer[] {
  const layers = ((): BackgroundLayer[] => {
    switch (pattern) {
      case "dots":
        return [{ width: unit, height: unit, tone: "dot", dots: corners(unit, unit).map(([x, y]) => [x, y, 1.15 * scale]) }];
      case "denseDots": {
        const width = unit / 2;
        return [{ width, height: width, tone: "dot", dots: corners(width, width).map(([x, y]) => [x, y, 0.8 * scale]) }];
      }
      case "lines":
        return [{ width: unit, height: unit, tone: "line", path: gridPath(unit, unit), stroke: scale }];
      case "graph":
        return [
          { width: unit / 4, height: unit / 4, tone: "line", path: gridPath(unit / 4, unit / 4), stroke: 0.6 * scale },
          { width: unit, height: unit, tone: "line", path: gridPath(unit, unit), stroke: 1.2 * scale },
        ];
      case "cross": {
        const arm = 4 * scale;
        return [{ width: unit, height: unit, tone: "dot", stroke: 1.2 * scale,
          path: corners(unit, unit).map(([x, y]) => `M${x - arm} ${y}H${x + arm}M${x} ${y - arm}V${y + arm}`).join("") }];
      }
      case "isometric": {
        const height = unit * Math.sqrt(3);
        return [{ width: unit, height, tone: "line", stroke: scale,
          path: `M0 0L${unit} ${height}M${unit} 0L0 ${height}M0 0H${unit}M0 ${height / 2}H${unit}M0 ${height}H${unit}` }];
      }
      case "diagonal": {
        const width = unit / 2;
        return [{ width, height: width, tone: "line", stroke: scale,
          path: `M0 ${width}L${width} 0M-1 1L1 -1M${width - 1} ${width + 1}L${width + 1} ${width - 1}` }];
      }
      case "hexagon": {
        const side = unit / 2;
        const height = side * Math.sqrt(3);
        return [{ width: side * 3, height, tone: "line", stroke: scale,
          path: `M0 ${height / 2}L${side / 2} 0H${side * 1.5}L${side * 2} ${height / 2}L${side * 1.5} ${height}H${side / 2}ZM${side * 2} ${height / 2}H${side * 3}` }];
      }
      case "stars": {
        const width = unit * 4;
        return [{ width, height: width, tone: "dot", dots: stars.map(([x, y, radius]) => [x * width, y * width, radius * scale]) }];
      }
      case "grain":
        return [{ width: 180, height: 180, tone: "dot", grain: true }];
      default:
        return [];
    }
  })();
  // ACT: 缩得很小时过密的图块会产生摩尔纹且耗费绘制，宽度小于 4px 的图层直接隐藏。
  return layers.filter(layer => layer.width >= 4);
}
