import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

// 查询云端任务；完成后把结果写进工作台输出目录，重复调用返回同一批文件。
export default Router().post("/", validateFields({
  directory: z.string().min(1).max(4096), mediaType: z.enum(["image", "video"]),
  taskId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), outputDirectory: z.string().min(1).max(1024),
}), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { directory, mediaType, taskId, outputDirectory } = req.body;
  const cwd = await u.workspace.resolveWorkspace(req, directory);
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once("aborted", abort);
  try {
    const result = await u.mediaGeneration.collectMediaTask(cwd, mediaType, taskId, outputDirectory, controller.signal);
    res.set("Cache-Control", "no-store").json(success(result));
  } finally { req.off("aborted", abort); }
});
