import axios from "axios";
import { translate } from "@toonflow/i18n/vue";
import { settings } from "@/stores/settings";

type TfRequestOptions = { apiKey?: string; signal?: AbortSignal };

type TfResponse<T> = { code: number; data: T; message?: string };

type TfPlugin = {
  id: number;
  name: string;
  identifier: string;
  userId: number;
  supplier: string;
  type: "node" | "skill" | "tool" | "agent" | "ext";
  state: number;
  desc: string;
  link: string;
  fileName: string;
  creationTime: number;
  installation: number;
  download: number;
  version: string;
  updateById: number | null;
  isCollected: boolean;
};

type TfPluginParams = {
  page: number;
  limit: number;
  type: "all" | "node" | "skill" | "tool" | "agent" | "ext" | "my" | "collection";
  searchKeyword?: string;
};

const client = axios.create({ baseURL: "https://api.toonflow.net" });

// 插件市场 Key 单独保存，模型改由麦麦云提供后不再借用供应商配置。
export function getTfApiKey() {
  const key = settings.value.tfApiKey;
  return typeof key === "string" ? key.trim().replace(/^Bearer(?:\s+|$)/i, "").trim() : "";
}

function requestOptions({ apiKey, signal }: TfRequestOptions = {}) {
  const key = (apiKey ?? getTfApiKey()).trim().replace(/^Bearer(?:\s+|$)/i, "").trim();
  if (!key) throw new Error("请先配置 TF-Router API Key");
  return { signal, timeout: 20000, headers: { Authorization: `Bearer ${key}` } };
}

function responseData<T>(response: TfResponse<T>, fallback = translate("TF-Router 请求失败")): T {
  if (!response || typeof response !== "object" || typeof response.code !== "number") throw new Error("TF-Router 响应格式不正确");
  if (response.code !== 200) throw new Error(response.message || fallback);
  return response.data;
}

export default {
  async getPlugIn(params: TfPluginParams, options?: TfRequestOptions) {
    if (!Number.isSafeInteger(params.page) || params.page < 1) throw new Error("页码必须为正整数");
    if (!Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 50) throw new Error("每页数量必须为 1 至 50 的整数");
    const { data } = await client.post<TfResponse<{ list: TfPlugin[]; total: number }>>("/v1/plugin/getPlugin", params, requestOptions(options));
    return responseData(data, translate("加载插件市场失败"));
  },

  async toggleCollection(pluginId: number, options?: TfRequestOptions): Promise<{ collected: boolean }> {
    if (!Number.isSafeInteger(pluginId) || pluginId < 1) throw new Error("插件 ID 必须为正整数");
    const { data } = await client.post<TfResponse<{ collected: boolean }>>("/v1/plugin/toggleCollection", { pluginId }, requestOptions(options));
    const collection = responseData(data, translate("更新插件收藏失败"));
    if (typeof collection?.collected !== "boolean") throw new Error("插件收藏响应格式不正确");
    return collection;
  },
};
