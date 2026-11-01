import { readdir, rm, rmdir } from "@toonflow/file";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

// ACT: 只删工作台自己创建的内容（作品、参考素材、首尾帧、生成记录），文件夹为空时再删文件夹本身；
// 用户选了已有资料的文件夹时，其他文件和文件夹都保留，避免误选磁盘根目录或个人目录时整个清空。
const workbenchEntries = ["generated", "references", "frames", "imageHistory.json", "videoHistory.json"];

export default Router().delete("/", validateFields({ directory: z.string().min(1).max(4096) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const directory = await u.workspace.resolveWorkspace(req, req.body.directory);
  const paths = await Promise.all(workbenchEntries.map(async entry => (await u.workspaceFile.resolveWorkspacePath(directory, entry)).path));
  const release = u.workspaceFile.lockWorkspaceFiles(paths);
  try {
    for (const path of paths) await rm(path, { recursive: true, force: true });
  } finally { release(); }
  const removedFolder = !(await readdir(directory)).length;
  if (removedFolder) await rmdir(directory);
  res.json(success({ removedFolder }));
});
