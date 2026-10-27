import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const connectionSchema = u.mediaProvider.modelConnectionSchema.extend({ apiKey: z.string().max(8192) });

export default Router().post("/", validateFields(connectionSchema.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const connection = connectionSchema.parse(req.body);
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.on("close", abort);
  try {
    const models = await u.ai.fetchProviderModels(connection, controller.signal);
    res.set("Cache-Control", "no-store").json(success(models.map(({ id, label }) => ({ id, label }))));
  } finally { res.off("close", abort); }
});
