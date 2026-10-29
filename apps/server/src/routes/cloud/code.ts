import u from "@/utils";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ email: z.string().trim().min(3).max(254) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  await u.cloud.sendCode(req.body.email.trim());
  res.json(success(null));
});
