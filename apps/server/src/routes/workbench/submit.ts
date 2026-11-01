import { Router } from "express";
import { z } from "zod";
import { imageGenerationSchema, videoGenerationSchema } from "@toonflow/tool-media-generation/runtime";
import { validateFields } from "@/lib/middleware";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";
import { translateMessage, validationOptions } from "@/lib/i18n";

// 工作台提交云端任务，立即返回云端任务编号，供页面写入生成记录并在刷新、重启后继续查询。
export default Router().post("/", validateFields({
  directory: z.string().min(1).max(4096), mediaType: z.enum(["image", "video"]),
}), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { directory, mediaType, ...request } = req.body;
  const parsed = (mediaType === "image" ? imageGenerationSchema : videoGenerationSchema).safeParse(request, validationOptions());
  if (!parsed.success) {
    res.status(400).json(error("参数错误", parsed.error.issues.map(issue => ({ ...issue, message: translateMessage(issue.message) })), 400));
    return;
  }
  const cwd = await u.workspace.resolveWorkspace(req, directory);
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once("aborted", abort);
  try {
    const taskId = await u.mediaGeneration.submitMediaTask(cwd, mediaType, parsed.data, controller.signal);
    res.set("Cache-Control", "no-store").json(success({ taskId }));
  } finally { req.off("aborted", abort); }
});
