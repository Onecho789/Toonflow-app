import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

// 麦麦云账户余额，单位 0.0001 元；附带充值页地址，前端不写死云端地址。
export default Router().post("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store").json(success({ balance: await u.cloudModels.getCloudBalance(), walletUrl: `${u.cloud.cloudUrl}/wallet` }));
});
