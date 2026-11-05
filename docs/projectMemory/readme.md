# 麦麦项目记忆

这里保存麦麦项目当前共享文档，客户端与云端仓库各保留一份。最后同步日期：2026-11-05。

- [共享工作约定](workspaceGuide.md)：工作目录、两个仓库的关系与提交约定。
- [打包、发布与部署](releaseWorkflow.md)：桌面打包、云端构建、部署与版本记录。
- [部署主记忆](maimaiCloud.md)：线上版本、验证记录与回退位置。
- [本机环境](localEnvNotes.md)：Bun、Windows 打包及本地开发说明。

## 维护与同步

完整本机工作区为 `D:\2api-codes\maimai`。其中根级 `AGENTS.md` 是 `workspaceGuide.md` 的来源，根级 `docs/` 下三个同名文档是其他文件的来源。修改共享文档后，同步到 `client/docs/projectMemory/` 与 `cloud/docs/projectMemory/`，核对四个文件内容一致，再分别提交和推送两个仓库。

单独克隆仓库时可直接阅读本目录；文档中的绝对路径记录原本机布局，相对 `client/`、`cloud/`、`docs/` 路径按完整工作区根目录解释。文中 `history/` 链接指本机 `D:\2api-codes\maimai\docs\history/` 的历史证据，安装包、构建日志和历史备份保留在对应本机位置。

凭据文件、`.env`、业务数据、依赖及构建产物不放入本目录；文档只保存凭据位置与条目名。
