import { t } from "@/lib/i18n";
import { z } from "zod";

export const modelConnectionSchema = z.object({
  apiUrl: z.url().max(2048).refine(value => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  }, "请填写不含凭据、查询参数或锚点的 HTTP API 地址"),
  protocol: z.enum(["openai", "anthropic", "gemini", "openai-completions", "openai-responses", "anthropic-messages"]),
});

export const listedModelsSchema = z.array(z.object({
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
})).max(2000).refine(models => new Set(models.map(model => model.id)).size === models.length, "模型 ID 不能重复");

const modelSchema = z.object({
  id: z.string().optional(), name: z.string().optional(),
  display_name: z.string().optional(), displayName: z.string().optional(),
  inputTokenLimit: z.number().int().positive().optional(),
  outputTokenLimit: z.number().int().positive().optional(),
  max_input_tokens: z.number().int().positive().nullable().optional(),
  max_tokens: z.number().int().positive().nullable().optional(),
});

export function providerModelsUrl({ apiUrl, protocol }: { apiUrl: string; protocol: string }) {
  const url = new URL(apiUrl);
  if (url.pathname === "/") url.pathname = protocol === "gemini" ? "/v1beta" : "/v1";
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/models$/, "")}/models`;
  return url;
}

export async function fetchProviderModels({ apiUrl, protocol, apiKey }: { apiUrl: string; protocol: string; apiKey: string }, signal?: AbortSignal) {
  modelConnectionSchema.parse({ apiUrl, protocol });
  const url = providerModelsUrl({ apiUrl, protocol });
  const anthropic = protocol === "anthropic" || protocol === "anthropic-messages";
  const gemini = protocol === "gemini";
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = apiKey.trim().replace(/^Bearer(?:\s+|$)/i, "").trim();
  if (anthropic) {
    headers["anthropic-version"] = "2023-06-01";
    if (key) headers["x-api-key"] = key;
    url.searchParams.set("limit", "1000");
  } else if (gemini) {
    if (key) headers["x-goog-api-key"] = key;
    url.searchParams.set("pageSize", "1000");
  } else if (key) headers.Authorization = `Bearer ${key}`;

  const models = new Map<string, { id: string; label: string; contextWindow?: number; maxOutputTokens?: number }>();
  const cursors = new Set<string>();
  const deadline = AbortSignal.timeout(30000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  while (true) {
    const response = await fetch(url, { headers, signal: requestSignal, redirect: "error" });
    if (!response.ok) throw new Error(t`模型列表获取失败（HTTP ${response.status}），请检查 API 地址、连接协议和密钥是否正确。`);
    const result = z.object({
      data: z.array(modelSchema).max(2000).optional(),
      models: z.array(modelSchema).max(2000).optional(),
      has_more: z.boolean().optional(), last_id: z.string().nullable().optional(),
      nextPageToken: z.string().optional(),
    }).parse(await response.json());
    const items = gemini ? result.models : result.data;
    if (!items) throw new Error("模型列表返回格式与所选协议不一致");
    for (const item of items) {
      // ACT: 保留平台返回的原始 ID；Gemini 的 models/ 前缀也不建立别名映射。
      const id = (gemini ? item.name : item.id)?.trim();
      if (!id) throw new Error("获取到的模型列表包含无效的模型 ID，无法正常加载。");
      models.set(id, { id, label: item.display_name || item.displayName || id,
        contextWindow: item.inputTokenLimit ?? item.max_input_tokens ?? undefined,
        maxOutputTokens: item.outputTokenLimit ?? item.max_tokens ?? undefined });
      if (models.size > 2000) throw new Error("模型列表不能超过 2000 个");
    }
    const cursor = gemini ? result.nextPageToken : anthropic && result.has_more ? result.last_id : undefined;
    if (anthropic && result.has_more && !cursor) throw new Error("模型列表缺少分页游标，无法继续获取后续模型。");
    if (!cursor) break;
    if (cursors.has(cursor)) throw new Error("模型列表返回了重复的分页游标，已停止获取后续模型。");
    cursors.add(cursor);
    url.searchParams.set(gemini ? "pageToken" : "after_id", cursor);
  }
  return [...models.values()];
}
