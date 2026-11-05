import { computed, ref, type Component } from "vue";
import {
  IconArrowsMaximize, IconArrowsSplit2, IconBrush, IconCameraRotate, IconCopy, IconCrop, IconHistory, IconInfoCircle,
  IconLayoutGrid, IconPanoramaHorizontal, IconPencil, IconSparkles, IconSun, IconTransfer, IconWand,
} from "@tabler/icons-vue";

export type ImageToolId =
  | "panorama" | "inpaint" | "lighting" | "multiAngle" | "gridSplit" | "splitNodes" | "copyPrompt" | "history" | "replace"
  | "info" | "crop" | "upscale" | "superResolve" | "reversePrompt" | "mark";

export type ImageTool = { id: ImageToolId; label: string; icon: Component };

// 顺序即工具栏顺序；图片节点与图片生成节点各取自己有的工具。
export const imageTools: ImageTool[] = [
  { id: "panorama", label: "全景图", icon: IconPanoramaHorizontal },
  { id: "inpaint", label: "局部重绘", icon: IconBrush },
  { id: "lighting", label: "打光", icon: IconSun },
  { id: "multiAngle", label: "多角度", icon: IconCameraRotate },
  { id: "gridSplit", label: "宫格切分", icon: IconLayoutGrid },
  { id: "splitNodes", label: "拆分为节点", icon: IconArrowsSplit2 },
  { id: "copyPrompt", label: "复制提示词", icon: IconCopy },
  { id: "history", label: "历史记录", icon: IconHistory },
  { id: "replace", label: "替换图片", icon: IconTransfer },
  { id: "info", label: "信息", icon: IconInfoCircle },
  { id: "crop", label: "裁剪", icon: IconCrop },
  { id: "upscale", label: "放大", icon: IconArrowsMaximize },
  { id: "superResolve", label: "AI 超分", icon: IconSparkles },
  { id: "reversePrompt", label: "反推提示词", icon: IconWand },
  { id: "mark", label: "标记", icon: IconPencil },
];

export type ImageToolbarSettings = { hidden: ImageToolId[]; showLabels: boolean };

// 与 infinite-canvas 一样存在浏览器本地；记录隐藏项，以后新增的工具默认显示。
const storageKey = "maimai-image-toolbar-v1";
// 图片节点与图片生成节点是两个插件包，各有一份模块状态，保存后用事件互相同步。
const changeEvent = "maimaiImageToolbarChange";
const defaultSettings: ImageToolbarSettings = { hidden: ["crop", "upscale", "reversePrompt"], showLabels: true };

function readSettings(): ImageToolbarSettings {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<ImageToolbarSettings> | null;
    if (!value) return { ...defaultSettings, hidden: [...defaultSettings.hidden] };
    const ids = new Set(imageTools.map(tool => tool.id));
    return {
      hidden: Array.isArray(value.hidden) ? value.hidden.filter(id => ids.has(id)) : [...defaultSettings.hidden],
      showLabels: value.showLabels !== false,
    };
  } catch {
    return { ...defaultSettings, hidden: [...defaultSettings.hidden] };
  }
}

const settings = ref(readSettings());
window.addEventListener(changeEvent, () => { settings.value = readSettings(); });
window.addEventListener("storage", event => { if (event.key === storageKey) settings.value = readSettings(); });

export function defaultImageToolbar(): ImageToolbarSettings {
  return { ...defaultSettings, hidden: [...defaultSettings.hidden] };
}

export function saveImageToolbar(value: ImageToolbarSettings) {
  localStorage.setItem(storageKey, JSON.stringify(value));
  window.dispatchEvent(new Event(changeEvent));
}

export function useImageToolbar() {
  return {
    settings,
    showLabels: computed(() => settings.value.showLabels),
    visible: (id: ImageToolId) => !settings.value.hidden.includes(id),
  };
}
