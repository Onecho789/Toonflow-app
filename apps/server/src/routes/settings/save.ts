import u from "@/utils";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { maxSystemPromptLength } from "@/agent/runtime/prompt";
import { t } from "@/lib/i18n";
import { providerSchema } from "@/utils/ai";

const router = Router();
let saveQueue = Promise.resolve();

export default router.put("/", validateFields({ settings: z.record(z.string(), z.json()).and(z.object({
  agentSystemPrompt: z.string().max(maxSystemPromptLength, { error: () => t`系统提示词不能超过 ${maxSystemPromptLength} 个字符` }).optional(),
  customProviders: z.array(providerSchema.extend({ id: z.string().min(1), label: z.string() })).optional(),
  network: u.network.networkSchema.optional(),
  desktopUpdateCustomUrl: z.string().max(2048).refine(value => !value || u.desktop.isValidUpdateUrl(value),
    "自定义更新源必须是不含账号、查询参数或锚点的 HTTP(S) 地址").optional(),
  mcp: z.object({ enabled: z.boolean().optional(), token: z.string().optional(), port: z.number().int().min(1).max(65535).optional() }).optional(),
  imageProtocols: u.imageProtocols.imageProtocolsSchema.optional(),
})) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { settings } = req.body;
  // ACT: 系统代理读取是异步的；串行保存完整快照，避免较早的请求覆盖较晚的配置。
  const saving = saveQueue.then(async () => {
    u.removeLegacySettings(settings);
    u.cleanNodeMenuSettings(settings);
    const previousSettings = u.conf.get("settings", {});
    const protocolIds = new Set(u.imageProtocols.getImageProtocols(settings).map(protocol => protocol.id));
    const deletedIds = new Set(u.imageProtocols.getImageProtocols(previousSettings).filter(protocol => !protocolIds.has(protocol.id)).map(protocol => protocol.id));
    if (deletedIds.size) for (const provider of await u.mediaProvider.listMediaProviders()) {
      if (!("modelConnection" in provider) || !provider.modelConnection) continue;
      const references = [provider.imageProtocolId, ...(provider.listedModels?.map(model => model.imageProtocolId) ?? [])];
      if (references.some(id => id && deletedIds.has(id))) throw Object.assign(new Error(`供应商“${provider.label}”仍引用该生图协议，请先修改供应商配置`), { status: 409 });
    }
    const network = settings.network !== undefined || previousSettings.network !== undefined
      ? await u.network.prepareNetwork(settings.network) : undefined;
    if (network) u.network.configureNetwork(network, undefined, () => u.conf.set("settings", settings));
    else u.conf.set("settings", settings);
    await u.mcpRuntime.reloadMcpRuntime();
    return { aiModels: u.ai.listAiModels(), nodeMenu: u.conf.get("settings.general.nodeMenu") ?? null };
  });
  saveQueue = saving.then(() => {}, () => {});
  res.json(success(await saving, "设置已保存"));
});
