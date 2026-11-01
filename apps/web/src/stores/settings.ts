import axios from "axios";
import { normalizeLocale } from "@toonflow/i18n";
import { computed, nextTick, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import { canvasShortcutFields, defaultCanvasShortcuts, getShortcutBindings, isShortcutAllowed, normalizeShortcut, type CanvasShortcuts } from "@/lib/canvasShortcuts";
import { normalizeNodeMenu, type StoredNodeMenuItem } from "@toonflow/server/nodeMenu";
import type { ThinkingLevel } from "@toonflow/server/modelReasoning";
import "element-plus/es/components/message/style/css";

export const settings = ref<Record<string, unknown>>({});
// ACT: 页面在 loadSettings 完成后才挂载，加载标记仅保留在设置初始化与自动保存内部。
let settingsReady = false;
let saveQueue = Promise.resolve();
let applyingSettings = false;

export const settingsStorage = {
  getItem(key: string) {
    const stores = settings.value.stores as Record<string, unknown> | undefined;
    if (stores && Object.hasOwn(stores, key)) return JSON.stringify(stores[key]);
    // ACT: 只迁移当前来源可读取的旧缓存，保留原值；不同端口的 localStorage 不能互读。
    const value = localStorage.getItem(key);
    if (value !== null) settingsStorage.setItem(key, value);
    return value;
  },
  setItem(key: string, value: string) {
    settings.value.stores = { ...(settings.value.stores as Record<string, unknown> | undefined), [key]: JSON.parse(value) };
  },
};

// 背景样式：晨曦麦浪、流星许愿、星云穿梭。
export const backgroundStyles = ["dawn", "meteor", "nebula"] as const;
export const defaultUiSettings = { theme: "light", language: "system", primaryColor: "#409eff", fontScale: 100, mobileScale: 75, radius: 8, startupAnimation: true, background: "meteor" as (typeof backgroundStyles)[number] };
export const uiSettings = computed(() => {
  const raw = settings.value.ui;
  const ui = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    language: normalizeLocale(ui.language) ?? "system" as const,
    theme: ui.theme === "light" || ui.theme === "dark" || ui.theme === "system" ? ui.theme : defaultUiSettings.theme,
    primaryColor: typeof ui.primaryColor === "string" && /^#[\da-f]{6}$/i.test(ui.primaryColor) ? ui.primaryColor : defaultUiSettings.primaryColor,
    fontScale: typeof ui.fontScale === "number" && Number.isFinite(ui.fontScale) ? Math.min(125, Math.max(85, ui.fontScale)) : defaultUiSettings.fontScale,
    mobileScale: typeof ui.mobileScale === "number" && Number.isFinite(ui.mobileScale) ? Math.min(100, Math.max(50, ui.mobileScale)) : defaultUiSettings.mobileScale,
    radius: typeof ui.radius === "number" && Number.isFinite(ui.radius) ? Math.min(16, Math.max(0, ui.radius)) : defaultUiSettings.radius,
    startupAnimation: ui.startupAnimation !== false,
    background: backgroundStyles.find(style => style === ui.background) ?? defaultUiSettings.background,
  };
});

export function updateUiSettings(patch: Partial<typeof defaultUiSettings>) {
  const current = settings.value.ui;
  settings.value = { ...settings.value, ui: { ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}), ...patch } };
}

export const generalSettings = computed(() => {
  const raw = settings.value.general;
  const general = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const shortcuts = general.canvasShortcuts && typeof general.canvasShortcuts === "object" && !Array.isArray(general.canvasShortcuts)
    ? general.canvasShortcuts as Record<string, unknown> : {};
  const savedBindings = new Map(canvasShortcutFields.flatMap(field => {
    const value = shortcuts[field.id];
    const binding = typeof value === "string" ? normalizeShortcut(value) : undefined;
    return binding !== undefined && isShortcutAllowed(field, binding) ? [[field.id, binding] as const] : [];
  }));
  return {
    nodeMenu: normalizeNodeMenu(general.nodeMenu),
    agentNotificationsEnabled: general.agentNotificationsEnabled !== false,
    canvasCompositingEnabled: general.canvasCompositingEnabled === true,
    canvasEdgeAnimationEnabled: general.canvasEdgeAnimationEnabled !== false,
    canvasEdgeColorMode: general.canvasEdgeColorMode === "none" || general.canvasEdgeColorMode === "custom" ? general.canvasEdgeColorMode : "theme",
    canvasEdgeColor: typeof general.canvasEdgeColor === "string" && /^#[\da-f]{6}$/i.test(general.canvasEdgeColor) ? general.canvasEdgeColor : defaultUiSettings.primaryColor,
    canvasShortcuts: Object.fromEntries(canvasShortcutFields.map(field => {
      if (savedBindings.has(field.id)) return [field.id, savedBindings.get(field.id)];
      const binding = defaultCanvasShortcuts[field.id];
      const conflicts = canvasShortcutFields.some(other => other.gesture === field.gesture
        && getShortcutBindings(savedBindings.get(other.id) ?? "").some(value => getShortcutBindings(binding).includes(value)));
      return [field.id, conflicts ? "" : binding];
    })) as CanvasShortcuts,
  };
});

export function updateGeneralSettings(patch: Omit<Partial<typeof generalSettings.value>, "nodeMenu"> & { nodeMenu?: StoredNodeMenuItem[] }) {
  const current = settings.value.general;
  settings.value = { ...settings.value, general: { ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}), ...patch } };
}

export type CloudModelGroup = { name: string; label: string; ratio: number };
type CloudAiModel = { providerId: string; providerLabel: string; modelId: string; label: string; vendor?: string; contextWindow: number; maxOutputTokens: number; reasoningLevels: ThinkingLevel[]; price?: string; groups?: CloudModelGroup[]; isDefault?: boolean };
// 文本模型由麦麦云按登录账号下发，本地只读展示，不保存供应商地址与密钥。
export const aiModels = ref<CloudAiModel[]>([]);
export const modelChoices = computed(() => aiModels.value.map(model => ({
  value: JSON.stringify([model.providerId, model.modelId]), providerId: model.providerId, modelId: model.modelId, label: model.label, vendor: model.vendor,
  contextWindow: model.contextWindow, reasoningLevels: model.reasoningLevels, isDefault: cloudDefaults.value.text?.model === model.modelId,
})));

// 各类型的默认模型与分组（线路），服务端按此给生成请求带分组请求头；对话、工作台与节点没有已保存选择时默认选中此模型。
export type CloudDefault = { model: string; group: string };
export const cloudDefaults = computed(() => {
  const raw = settings.value.cloudDefaults;
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries((["text", "image", "video"] as const).flatMap(type => {
    const value = record[type] as Partial<CloudDefault> | undefined;
    return value && typeof value.model === "string" && value.model ? [[type, { model: value.model, group: typeof value.group === "string" && value.group ? value.group : "default" }]] : [];
  })) as Partial<Record<"text" | "image" | "video", CloudDefault>>;
});

// 保存成功后再让节点重新读取模型列表，确保拿到新的 isDefault 标记。
export async function updateCloudDefault(type: "text" | "image" | "video", value: CloudDefault) {
  await saveSettings(current => {
    const saved = current.cloudDefaults;
    return { cloudDefaults: { ...(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}), [type]: value } };
  });
  invalidateNodeModels(type === "text" ? "language" : "media");
}

// 分组选项文字，例如“标准 ×1”。
export const groupText = (group: CloudModelGroup) => `${group.label || group.name} ×${group.ratio}`;
// 云端未下发分组时视为只有 default。
export const modelGroups = (groups?: CloudModelGroup[]) => groups?.length ? groups : [{ name: "default", label: "标准", ratio: 1 }];

// refresh 为 true 时让服务端绕过模型目录缓存，用于设置页“刷新”。
export async function loadAiModels(refresh = false) {
  const { data } = await axios.get<{ code: number; data: CloudAiModel[] }>(
    "/api/ai/models", { params: refresh ? { refresh: "1" } : undefined, headers: { "Cache-Control": "no-cache", "x-toonflow-workspace": "1" } },
  );
  if (data.code !== 200 || !Array.isArray(data.data)) throw new Error("读取文本模型失败");
  aiModels.value = data.data;
  invalidateNodeModels("language");
}

export async function loadSettings() {
  if (settingsReady) return;
  const { data } = await axios.get("/api/settings/get", { headers: { "Cache-Control": "no-cache", "x-toonflow-workspace": "1" } });
  if (settingsReady) return;
  if (data.code !== 200 || !data.data || typeof data.data !== "object" || Array.isArray(data.data)) {
    throw new Error("读取设置失败");
  }
  settings.value = data.data;
  // ACT: 云端不可达时不阻塞启动，模型列表为空，可在文本模型页刷新重试。
  await loadAiModels().catch(() => {});
  // 等初始化引发的监听执行完，再允许自动保存。
  await nextTick();
  settingsReady = true;
}

export function saveSettings(update?: (current: Record<string, unknown>) => Record<string, unknown> | undefined) {
  // ACT: 队列内读取最新配置再计算变更，确认成功后发布；仅协调当前页面的保存。
  const saving = saveQueue.then(async () => {
    const patch = update?.(settings.value);
    if (update && !patch) return false;
    const requestedNodeMenu = JSON.stringify(((patch?.general ?? settings.value.general) as { nodeMenu?: unknown } | undefined)?.nodeMenu);
    const { data } = await axios.put<{ code: number; data: { nodeMenu?: StoredNodeMenuItem[] | null } | null }>(
      "/api/settings/save", { settings: { ...settings.value, ...patch } }, { headers: { "x-toonflow-workspace": "1" } },
    );
    if (data.code !== 200) throw new Error("保存设置失败");
    if (patch) {
      applyingSettings = true;
      try { settings.value = { ...settings.value, ...patch }; }
      finally { applyingSettings = false; }
    }
    if (data.data && Object.hasOwn(data.data, "nodeMenu")
      && requestedNodeMenu === JSON.stringify((settings.value.general as { nodeMenu?: unknown } | undefined)?.nodeMenu)
      && requestedNodeMenu !== JSON.stringify(data.data.nodeMenu ?? undefined)) {
      applyingSettings = true;
      try {
        const general = { ...(settings.value.general as Record<string, unknown> | undefined) };
        if (data.data.nodeMenu?.length) general.nodeMenu = data.data.nodeMenu;
        else delete general.nodeMenu;
        settings.value = { ...settings.value, general };
      } finally { applyingSettings = false; }
    }
    return true;
  });
  saveQueue = saving.then(() => {}, () => {});
  return saving;
}

watch(settings, () => {
  if (!settingsReady || applyingSettings) return;
  void saveSettings().catch(() => { ElMessage.error("设置保存失败，请稍后重试"); });
}, { deep: true, flush: "sync" });
