import u from "@/utils";
import { Router } from "express";
import { success } from "@/lib/responseFormat";

export default Router().post("/", (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.json(success({ url: u.cloud.startLogin() }));
});
