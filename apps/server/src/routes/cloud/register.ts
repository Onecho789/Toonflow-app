import u from "@/utils";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ email: z.string().trim().min(3).max(254), code: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(128) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.json(success(await u.cloud.register(req.body.email.trim(), req.body.code, req.body.password)));
});
