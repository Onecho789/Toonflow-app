import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const configurationSchema = z.object({
  label: z.string().trim().min(1).max(200),
  modelConnection: u.mediaProvider.modelConnectionSchema,
  listedModels: u.mediaProvider.listedModelsSchema.min(1),
  fileName: u.mediaProvider.mediaProviderFileSchema.optional(),
  revision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  adapterSource: z.string().min(1).max(1024 * 1024).optional(),
  imageProtocolId: z.string().max(96).optional(),
});

export default Router().post("/", validateFields(configurationSchema.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const configuration = configurationSchema.parse(req.body);
  if (!!configuration.fileName !== !!configuration.revision) throw Object.assign(new Error("编辑供应商时必须同时提供文件名和版本"), { status: 400 });
  res.json(success(await u.mediaProvider.configureMediaProvider(configuration)));
});
