import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

// refresh=1 时绕过服务端模型目录缓存，供设置页“刷新”使用。
export default Router().get("/", validateFields({ refresh: z.literal("1").optional() }, "query"), async (req, res) => {
  res.json(success(await u.ai.listAiModels(req.query.refresh === "1")));
});
