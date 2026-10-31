import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import type { Context, KnownApi, Model, ThinkingLevelMap } from "@earendil-works/pi-ai";
import { thinkingLevels, type ThinkingLevel } from "@/lib/modelReasoning";
import { z } from "zod";
import conf from "@/utils/conf";
import { getApiKey, sessionFetch } from "@/utils/cloud";
import { cloudProviderId, gatewayUrl, listCloudModels } from "@/utils/cloud/models";
import { readReference } from "@/utils/media/generation";
import { findModelContextLimits } from "@/utils/ai/modelContextLimits";
import { createFileTransport, getUnsupportedFileText, type FileProvider } from "@/utils/ai/files";
import { getRequestFiles } from "@/utils/ai/requestFiles";
import { readFile, stat } from "@toonflow/file";
import { resolveWorkspacePath } from "@/utils/workspace/files";
import { getReadableFileMimeType } from "@/lib/documentFormats";
import { readDocument } from "@/utils/documents";

type TextModel = { id: string; label: string; vendor?: string; contextWindow?: number; maxOutputTokens?: number; reasoningLevels: ThinkingLevel[] };

const builtinModels: Model<KnownApi>[] = getBuiltinProviders().flatMap(provider => getBuiltinModels(provider));

// 档位只来自云端下发；客户端统一发 OpenAI 风格的档位名（含 off），由网关按模型格式转换。
export function getModelReasoning(model: TextModel, protocol: string) {
  const { reasoningLevels } = model;
  const thinkingLevelMap: ThinkingLevelMap = {};
  for (const level of thinkingLevels) thinkingLevelMap[level] = reasoningLevels.includes(level) ? level : null;
  // 固定 OpenAI 格式，不让 SDK 按 baseUrl 猜厂商改写字段。
  const compat = protocol === "openai-completions" ? { thinkingFormat: "openai" as const, supportsReasoningEffort: true } : undefined;
  return { reasoning: reasoningLevels.length > 0, thinkingLevelMap, reasoningLevels, compat };
}

export function getModelLimits(providerId: string, model: TextModel) {
  // 云端后台填写的上下文与输出上限各自优先，缺的一项再查内置限制表和 SDK 模型目录。
  const limits = findModelContextLimits(model.id);
  const matches = builtinModels.filter(item => item.id === model.id);
  const exact = matches.find(item => item.provider === providerId);
  const candidates = exact ? [exact] : matches;
  // ACT: 只精确匹配 ID；跨供应商同名参数逐项一致才采用，不猜别名。
  const contextWindow = candidates.every(item => item.contextWindow === candidates[0]?.contextWindow) ? candidates[0]?.contextWindow : undefined;
  const maxTokens = candidates.every(item => item.maxTokens === candidates[0]?.maxTokens) ? candidates[0]?.maxTokens : undefined;
  return {
    contextWindow: model.contextWindow ?? limits?.contextWindow ?? contextWindow ?? 262144,
    maxTokens: model.maxOutputTokens ?? limits?.maxTokens ?? maxTokens ?? 32768,
  };
}

const positiveInteger = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0 ? value as number : undefined;

const cloudProtocols = { chat: "openai-completions", responses: "openai-responses" } as const;

// 文本模型统一来自麦麦云目录，旧对话里保存的其他 providerId 按模型 ID 匹配。
async function cloudTextModels() {
  return (await listCloudModels()).filter(model => model.type === "text").map(item => {
    const meta = item.meta as { contextWindow?: unknown; maxOutputTokens?: unknown; reasoning?: unknown; reasoningEfforts?: unknown };
    // 新契约 meta.reasoning.efforts 优先，兼容旧 meta.reasoningEfforts；都没有视为不支持思考。
    const efforts = meta.reasoning && typeof meta.reasoning === "object" ? (meta.reasoning as { efforts?: unknown }).efforts : meta.reasoningEfforts;
    const model = {
      id: item.id, label: item.label, vendor: item.vendor,
      contextWindow: positiveInteger(meta.contextWindow), maxOutputTokens: positiveInteger(meta.maxOutputTokens),
      reasoningLevels: Array.isArray(efforts) ? thinkingLevels.filter(level => efforts.includes(level)) : [],
    } satisfies TextModel;
    return { model, protocol: cloudProtocols[item.protocol as keyof typeof cloudProtocols] ?? "openai-completions" };
  });
}

export async function getConfiguredModel(_providerId: string, modelId: string) {
  const found = (await cloudTextModels()).find(item => item.model.id === modelId);
  if (!found) throw Object.assign(new Error(conf.get("cloudSession") ? "所选模型已下架或不存在，请重新选择" : "请先登录麦麦云账号"), { status: 400 });
  const { model, protocol } = found;
  const provider = { apiUrl: gatewayUrl, apiKey: getApiKey(), protocol };
  const limits = getModelLimits(cloudProviderId, model);
  return { provider, model: { ...model, ...getModelReasoning(model, protocol), contextWindow: limits.contextWindow, maxOutputTokens: limits.maxTokens }, baseUrl: gatewayUrl };
}

export async function listAiModels() {
  return (await cloudTextModels()).map(({ model, protocol }) => {
    const limits = getModelLimits(cloudProviderId, model);
    return {
      providerId: cloudProviderId, providerLabel: "麦麦云", protocol, modelId: model.id, label: model.label, vendor: model.vendor,
      contextWindow: limits.contextWindow, maxOutputTokens: limits.maxTokens,
      reasoningLevels: getModelReasoning(model, protocol).reasoningLevels,
    };
  });
}

const aiApis = {
  "openai-completions": openAICompletionsApi(),
  "openai-responses": openAIResponsesApi(),
  "anthropic-messages": anthropicMessagesApi(),
};

export const aiReferenceSchema = z.discriminatedUnion("dataType", [
  z.object({ dataType: z.literal("STRING"), value: z.string().max(1000000) }),
  z.object({ dataType: z.literal("IMAGE"), value: z.object({ url: z.string().min(1).max(4096), mimeType: z.string().startsWith("image/") }) }),
  z.object({ dataType: z.literal("VIDEO"), value: z.object({ url: z.string().min(1).max(4096), mimeType: z.string().startsWith("video/") }) }),
  z.object({ dataType: z.literal("FILE"), value: z.object({ url: z.string().min(1).max(4096), mimeType: z.string().min(1).max(128) }) }),
]);

export async function readAiReferences(
  directory: string | undefined,
  references: z.infer<typeof aiReferenceSchema>[],
  signal?: AbortSignal,
  provider?: FileProvider,
) {
  return Promise.all(references.map(async (item) => {
    signal?.throwIfAborted();
    if (item.dataType === "STRING") return { dataType: item.dataType, value: item.value };
    if (!directory) throw Object.assign(new Error("文件参考需要工作目录"), { status: 400 });
    if (item.dataType === "FILE") {
      if (!getReadableFileMimeType(item.value.url, item.value.mimeType)) throw Object.assign(new Error("不支持此参考文件格式"), { status: 400 });
      const { path } = await resolveWorkspacePath(directory, item.value.url);
      const info = await stat(path);
      if (!info.isFile() || info.size > 100 * 1024 * 1024) throw Object.assign(new Error("参考文档须为不超过 100 MB 的文件"), { status: 400 });
      const content = await readDocument(item.value.url, await readFile(path, { signal }), item.value.mimeType);
      signal?.throwIfAborted();
      return { dataType: "STRING" as const, value: `参考文档：${item.value.url}\n${content.toString("utf8")}` };
    }
    const unsupported = provider && getUnsupportedFileText(provider, { path: item.value.url, mimeType: item.value.mimeType });
    if (unsupported) return { dataType: "STRING" as const, value: unsupported };
    const media = await readReference(directory, { path: item.value.url, mimeType: item.value.mimeType }, item.dataType.toLowerCase(), signal);
    return { dataType: item.dataType, value: `data:${media.mimeType};base64,${media.data}` };
  }));
}

export function referenceContent(protocol: string, prompt: string, references: Awaited<ReturnType<typeof readAiReferences>>, referenceOffset = 0) {
  const textPart = (text: string) => ({ type: protocol === "openai-responses" ? "input_text" : "text", text });
  const content: object[] = [textPart(prompt)];
  references.forEach((item, index) => {
    content.push(textPart(`{{ref ${referenceOffset + index + 1}}}${item.dataType === "STRING" ? `\n${item.value}` : ""}`));
    if (item.dataType === "STRING") return;
    if (protocol === "openai-completions") {
      content.push(item.dataType === "IMAGE"
        ? { type: "image_url", image_url: { url: item.value } }
        : { type: "video_url", video_url: { url: item.value } });
    } else if (protocol === "openai-responses") {
      const extension = item.value.slice(11, item.value.indexOf(";")).replace("quicktime", "mov");
      content.push(item.dataType === "IMAGE"
        ? { type: "input_image", image_url: item.value, detail: "auto" }
        : { type: "input_file", filename: `reference${referenceOffset + index + 1}.${extension}`, file_data: item.value });
    } else {
      const separator = item.value.indexOf(",");
      content.push({
        type: item.dataType === "IMAGE" ? "image" : "document",
        source: { type: "base64", media_type: item.value.slice(5, item.value.indexOf(";")), data: item.value.slice(separator + 1) },
      });
    }
  });
  return content;
}

export function streamAi(
  configured: Awaited<ReturnType<typeof getConfiguredModel>>,
  context: Context,
  signal: AbortSignal,
  references: Awaited<ReturnType<typeof readAiReferences>> = [],
) {
  const { provider, model: configuredModel, baseUrl } = configured;
  const model: Model<typeof provider.protocol> = {
    id: configuredModel.id, name: configuredModel.label, provider: "toonflow", api: provider.protocol, baseUrl,
    reasoning: false, input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: configuredModel.contextWindow,
    maxTokens: configuredModel.maxOutputTokens,
  };
  const files = createFileTransport({ ...provider, apiUrl: baseUrl }, { fetch: sessionFetch, signal });
  return aiApis[provider.protocol].streamSimple(model, context, {
    apiKey: provider.apiKey,
    signal,
    // 此入口没有 AgentSession，仅重试尚未交付响应的请求，已输出的流不能直接拼接重放。
    maxRetries: 3,
    fetch: files.fetch,
    onPayload: async (payload) => {
      let body = payload as Record<string, unknown>;
      if (references.length) {
        const field = provider.protocol === "openai-responses" ? "input" : "messages";
        const messages = body[field] as { role: string; content: unknown }[];
        // ACT: 后续 Anthropic 工具结果也使用 user 角色，附件只补充到最初的输入。
        const firstUser = messages.findIndex(message => message.role === "user");
        const attachmentContent = referenceContent(provider.protocol, "", references).slice(1);
        body = { ...body, [field]: messages.map((message, index) => index === firstUser
          ? { ...message, content: [
            ...(Array.isArray(message.content) ? message.content : referenceContent(provider.protocol, String(message.content ?? ""), [])),
            ...attachmentContent,
          ] }
          : message) };
      }
      await files.prepare(body);
      const imageBytes = getRequestFiles(body).filter(file => file.mimeType.toLowerCase().startsWith("image/")).reduce((sum, file) => sum + file.inlineBytes, 0);
      if (imageBytes > 20 * 1024 * 1024
        || Buffer.byteLength(JSON.stringify(body), "utf8") > 32 * 1024 * 1024) {
        throw new Error("模型请求超过附件或请求体字节预算，请减少附件或上下文后重试");
      }
      return body;
    },
  });
}
