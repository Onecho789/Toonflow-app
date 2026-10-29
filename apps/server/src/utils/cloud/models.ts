import conf from "@/utils/conf";
import { t } from "@/lib/i18n";
import { cloudUrl, dropApiKey, getApiKey } from "@/utils/cloud";

export type CloudModel = {
  id: string;
  type: "text" | "image" | "video";
  label: string;
  protocol: "chat" | "responses" | "image" | "video";
  // 金额单位为 0.0001 元，文本按每百万 token，图片按张，视频按秒。
  pricing: { input: number; output: number; unit: number };
  meta: Record<string, unknown>;
};

export const gatewayUrl = `${cloudUrl}/v1`;
export const cloudProviderId = "maimai";
// ACT: 模型目录对所有用户相同，进程内缓存 5 分钟，未登录时不请求；后台改价或上下架最迟 5 分钟后生效。
let cache: { expires: number; value: Promise<CloudModel[]> } | undefined;

export async function gatewayError(response: Response) {
  const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return Object.assign(new Error(result?.error?.message || t`麦麦云请求失败（HTTP ${response.status}）`), { status: response.status >= 500 ? 502 : response.status });
}

// 带客户端 Key 调用网关；Key 失效时丢弃并重建一次。
export async function gatewayFetch(path: string, init: RequestInit = {}) {
  for (let attempt = 0; ; attempt++) {
    const key = await getApiKey();
    let response: Response;
    try {
      response = await fetch(`${gatewayUrl}${path}`, { ...init, headers: { ...init.headers as Record<string, string>, Authorization: `Bearer ${key}` } });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw Object.assign(new Error("无法连接麦麦云，请检查网络后重试"), { status: 502 });
    }
    if (response.status !== 401 || attempt) return response;
    await response.body?.cancel();
    dropApiKey(key);
  }
}

export function listCloudModels(): Promise<CloudModel[]> {
  if (!conf.get("cloudSession")) return Promise.resolve([]);
  if (cache && cache.expires > Date.now()) return cache.value;
  const entry = { expires: Date.now() + 5 * 60_000, value: Promise.resolve<CloudModel[]>([]) };
  entry.value = (async () => {
    const response = await gatewayFetch("/models", { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw await gatewayError(response);
    const { data } = await response.json() as { data: CloudModel[] };
    return data;
  })();
  cache = entry;
  void entry.value.catch(() => { if (cache === entry) cache = undefined; });
  return entry.value;
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
