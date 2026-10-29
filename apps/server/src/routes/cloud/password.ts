import u from "@/utils";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ oldPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.json(success(await u.cloud.changePassword(req.body.oldPassword, req.body.newPassword)));
});
