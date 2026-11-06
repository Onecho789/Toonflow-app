# 麦麦项目工作入口

以后统一在 D:\2api-codes\maimai 工作。开始任务先读本文件；涉及打包、发布、部署时先读 [发布流程](docs/releaseWorkflow.md) 和 [部署记忆](docs/maimaiCloud.md)。

- client/：麦麦工坊桌面客户端，独立 Git 仓库。代码规范见 client/AGENTS.md。
- cloud/：麦麦云 Go 服务端与 Vue 管理端，独立 Git 仓库。当前生产构建入口是 cloud/server/Dockerfile。
- 根目录只承载工作入口与共享记忆，本身不是 Git 仓库。Git 命令分别在 client 或 cloud 执行；不要在根目录重新初始化或合并两个仓库。
- 根级 AGENTS.md 和 docs/ 下三份当前文档同步保存在两个仓库的 docs/projectMemory/；修改共享记忆后同步副本并分别提交、推送。仅克隆单个仓库时从其中的 readme.md 进入；历史证据保留在本机 docs/history/。
- 当前源码路径固定为 D:\2api-codes\maimai\client 与 D:\2api-codes\maimai\cloud；旧 Toonflow-app、maimai-cloud 目录已于 2026-11-06 删除，历史记录中的旧路径不再存在。
- 本机环境和 Windows 打包注意事项见 docs/localEnvNotes.md。历史发布证据放 docs/history/，不作为当前版本或重新部署指令。
- 成功发布后同步更新 docs/maimaiCloud.md、docs/releaseWorkflow.md 中的版本、提交、摘要、验证结果、备份和回退位置；后续以这里为主记忆，旧目录中的文件仅留作追溯。
- 沿用已确认的偏好：不创建 PR；用户要求推送时推送自有 origin，upstream 只拉不推。客户端功能提交时维护 client/docs/forkChanges.md。
- 凭据只引用外部文件位置：统一凭据文件 D:\2api-codes\资料\maimaiCredentials.md（不进任何 Git 仓库），条目见发布流程；不将凭据或 .env 内容放入共享记忆。
- 文件操作使用 PowerShell 原生命令及可用的 -LiteralPath，先确认绝对路径、目标类型、联接、Git HEAD 与工作区，再变更并核对结果。
- 清理只针对已确认的临时文件；保留 .env、node_modules、.hutch、业务数据、发布快照及关联工作树。不因目录含有旧源码就整目录删除。

来源：用户指定的额度兑换/迁移对话 01a19d5a-e7e2-7f73-beee-2e8a0f446f45，2026-11-03 整理。
