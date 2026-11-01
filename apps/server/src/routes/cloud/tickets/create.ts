import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  category: z.enum(["bug", "feature", "plugin", "model", "account", "other"]),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(5000),
  clientInfo: z.string().max(500),
}), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { category, title, content, clientInfo } = req.body as Record<string, string>;
  res.json(success(await u.cloudTickets.createTicket({ category: category!, title: title!.trim(), content: content!.trim(), clientInfo: clientInfo! })));
});
