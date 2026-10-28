import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const testSchema = z.object({
  protocol: u.imageProtocols.imageProtocolSchema,
  providerId: z.string().min(1).max(96),
  model: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(4000),
});

export default Router().post("/", validateFields(testSchema.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { protocol, providerId, model, prompt } = testSchema.parse(req.body);
  const provider = await u.mediaProvider.getMediaProvider(providerId);
  if (!provider.modelConnection) throw Object.assign(new Error("只能使用填表接入的供应商测试生图协议"), { status: 400 });
  const config = { apiUrl: provider.modelConnection.apiUrl, apiKey: u.mediaProvider.getMediaProviderApiKey(provider.id) };
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.on("close", abort);
  try {
    // ACT: 测试使用未保存的协议草稿，只发文生图请求；密钥从服务端配置读取，不经过前端。
    const assets = await u.imageProtocols.generateProtocolImage.call({
      config, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5 * 60_000)]),
      tool: { fetch, errorMessage: value => u.mediaProvider.mediaErrorMessage(value, config) },
    }, protocol, { model, prompt });
    res.set("Cache-Control", "no-store").json(success(assets));
  } finally { res.off("close", abort); }
});
