import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ id: z.number().int().positive() }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.json(success(await u.cloudTickets.closeTicket((req.body as { id: number }).id)));
});
