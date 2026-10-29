import u from "@/utils";
import { Router } from "express";
import { success } from "@/lib/responseFormat";

export default Router().post("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  await u.cloud.logout();
  res.json(success(null));
});
