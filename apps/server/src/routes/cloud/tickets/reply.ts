import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ id: z.number().int().positive(), content: z.string().trim().min(1).max(5000) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { id, content } = req.body as { id: number; content: string };
  res.json(success(await u.cloudTickets.replyTicket(id, content.trim())));
});
