import conf from "@/utils/conf";
import { t } from "@/lib/i18n";
import { cloudUrl, sessionFetch } from "@/utils/cloud";

export type CloudModel = {
  id: string;
  type: "text" | "image" | "video";
  label: string;
  // lobehub 图标名，由后台填写，可能为空串；客户端为空时按模型 ID 推断。
  vendor?: string;
  protocol: "chat" | "responses" | "image" | "video";
  // 金额单位为 0.0001 元，文本按每百万 token，图片按张，视频按秒。
  pricing: { input: number; output: number; unit: number };
  meta: Record<string, unknown>;
  // 该模型可用的分组（线路），ratio 为倍率小数；云端未下发时视为只有 default。
  groups: CloudGroup[];
};
export type CloudGroup = { name: string; label: string; ratio: number };
type CloudDefaults = Partial<Record<CloudModel["type"], { model?: unknown; group?: unknown }>>;

export const gatewayUrl = `${cloudUrl}/v1`;
export const cloudProviderId = "maimai";
// ACT: 模型目录对所有用户相同，进程内缓存 1 分钟，未登录时不请求；后台改价、上下架或改分组最迟 1 分钟后生效，设置页刷新可立即生效。
let cache: { expires: number; value: Promise<CloudModel[]> } | undefined;

export async function gatewayError(response: Response) {
  const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return Object.assign(new Error(result?.error?.message || t`麦麦云请求失败（HTTP ${response.status}）`), { status: response.status >= 500 ? 502 : response.status });
}

export async function gatewayFetch(path: string, init: RequestInit = {}) {
  try {
    return await sessionFetch(`${gatewayUrl}${path}`, init);
  } catch (error) {
    if (init.signal?.aborted || (error as { status?: number }).status) throw error;
    throw Object.assign(new Error("无法连接麦麦云，请检查网络后重试"), { status: 502 });
  }
}

export function listCloudModels(refresh = false): Promise<CloudModel[]> {
  if (!conf.get("cloudSession")) return Promise.resolve([]);
  if (!refresh && cache && cache.expires > Date.now()) return cache.value;
  const entry = { expires: Date.now() + 60_000, value: Promise.resolve<CloudModel[]>([]) };
  entry.value = (async () => {
    const response = await gatewayFetch("/models", { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw await gatewayError(response);
    const { data, groups } = await response.json() as { data: (Omit<CloudModel, "groups"> & { groups?: CloudGroup[] })[]; groups?: CloudGroup[] };
    // 旧版云端没有分组字段，按只有 default 处理；名称与倍率优先取顶层分组列表里的 default。
    const fallback = groups?.find(item => item.name === "default") ?? { name: "default", label: "标准", ratio: 1 };
    return data.map(model => ({ ...model, groups: model.groups?.length ? model.groups : [fallback] }));
  })();
  cache = entry;
  void entry.value.catch(() => { if (cache === entry) cache = undefined; });
  return entry.value;
}

// 设置里保存的各类型默认模型与分组，由设置页写入。
export function getCloudDefault(type: CloudModel["type"]) {
  const value = (conf.get("settings", {}).cloudDefaults as CloudDefaults | undefined)?.[type];
  return { model: typeof value?.model === "string" ? value.model : undefined, group: typeof value?.group === "string" ? value.group : undefined };
}

const generationPaths: [RegExp, CloudModel["type"]][] = [[/^\/v1\/(chat\/completions|responses|messages)$/, "text"], [/^\/v1\/images\/(generations|tasks)$/, "image"], [/^\/v1\/videos$/, "video"]];

// 生成请求按模型类型取设置里的默认分组，返回 undefined 表示不带请求头（云端走 default）。
// 所请求模型不在该分组时回退 default；模型也不在 default 时照原分组发送，由云端返回可用分组提示用户自己选，不自动换到别的分组。
export async function requestGroup(path: string, method = "GET", body?: unknown) {
  const type = method.toUpperCase() === "POST" ? generationPaths.find(([pattern]) => pattern.test(path.split("?")[0]!))?.[1] : undefined;
  if (!type) return;
  const group = getCloudDefault(type).group ?? "default";
  // ACT: 只读请求体开头的 model 字段（SDK 与媒体请求体都把 model 放在第一个），避免为取模型 ID 解析几十 MB 的 JSON；取不到时按设置的分组发送。
  const modelId = typeof body === "string" ? /^\s*\{\s*"model"\s*:\s*"([^"\\]{1,256})"/.exec(body.slice(0, 512))?.[1] : undefined;
  const names = modelId ? (await listCloudModels().catch(() => [])).find(item => item.id === modelId && item.type === type)?.groups.map(item => item.name) : undefined;
  if (names && !names.includes(group) && names.includes("default")) return;
  return group === "default" ? undefined : group;
}

const yuan = (value: number) => `¥${(value / 10000).toFixed(4).replace(/(\.\d\d\d*?)0+$/, "$1")}`;

// 设置页展示用的价格说明，与云端计费公式一致：图片按张、视频按秒，档位倍率不同时显示起步价。
export function cloudPriceText(model: CloudModel) {
  const { input, output, unit } = model.pricing;
  if (model.type === "text") return `输入 ${yuan(input)} · 输出 ${yuan(output)} / 百万 token`;
  const meta = model.meta as { sizePrices?: Record<string, number>; resolutionPrices?: Record<string, number> };
  const rates = Object.values((model.type === "image" ? meta.sizePrices : meta.resolutionPrices) ?? {}).filter(rate => typeof rate === "number" && rate > 0);
  const lowest = rates.length ? Math.min(...rates) : 1;
  const varies = rates.some(rate => rate !== lowest);
  return `${yuan(Math.ceil(unit * lowest))} / ${model.type === "image" ? "张" : "秒"}${varies ? " 起" : ""}`;
}

export async function findCloudModel(modelId: string, type: CloudModel["type"]) {
  const model = (await listCloudModels()).find(item => item.id === modelId && item.type === type);
  if (!model) throw Object.assign(new Error(conf.get("cloudSession") ? "所选模型已下架或不存在，请重新选择" : "请先登录麦麦云账号"), { status: 400 });
  return model;
}

// 余额单位为 0.0001 元。
export async function getCloudBalance(signal?: AbortSignal) {
  const response = await gatewayFetch("/balance", { signal: signal ?? AbortSignal.timeout(15000) });
  if (!response.ok) throw await gatewayError(response);
  return (await response.json() as { balance: number }).balance;
}
