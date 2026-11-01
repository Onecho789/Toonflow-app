import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().get("/", validateFields({
  page: z.coerce.number().int().min(1).max(100000),
  size: z.coerce.number().int().min(1).max(50),
  type: z.enum(["all", "collection", "node", "ext", "skill", "tool"]),
  keyword: z.string().max(64).optional(),
}, "query"), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { page, size, type, keyword } = req.query as Record<string, string>;
  res.set("Cache-Control", "no-store");
  res.json(success(await u.cloudPlugins.listCloudPlugins({ page: Number(page), size: Number(size), type, keyword: keyword?.trim() })));
});
