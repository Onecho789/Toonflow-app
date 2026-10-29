import u from "@/utils";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ code: z.string().regex(/^[\w-]{1,100}$/), state: z.string().regex(/^[\w-]{1,100}$/) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.json(success(await u.cloud.finishLogin(req.body.code, req.body.state)));
});
