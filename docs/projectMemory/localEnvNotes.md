---
name: local-env-notes
description: 本机运行 typecheck/server 的环境坑：Hutch devkit 下载需绕过代理、Bun 版本须 1.4.3
metadata:
  node_type: memory
  type: reference
  originSessionId: a4e5b9b7-7d08-4242-828c-bcef08c8d043
  modified: 2026-11-01T10:33:38.970Z
---

- Bun 通过 npm 全局安装（`npm install -g bun@1.4.3`），上游要求 1.4.3；1.3.14 下 server 启动会因 undici 报 `markAsUncloneable is not a function`。
- typecheck 依赖 `.hutch/devkit`（被 gitignore）。缺失时用 `~/.hutch/npm/electrobun/2.0.1/windows-x64/bin/hutch.exe electrobun sync` 生成，必须去掉 HTTP(S)_PROXY（本机代理 127.0.0.1:7890 会导致 ReleaseDownloadFailed）。
- 打 Windows 安装包用 `bun run package:desktop`（`build:desktop` 只构建程序、不出 NSIS Setup.exe，且会清空旧产物）。在 Git Bash 里要 `PATH="/c/Windows/System32:$PATH"` 前置，否则 GNU tar 把 `D:` 当远程主机报 `Cannot connect to D:`。产物在 `build/desktop/artifacts/MaiMaiStudio-<版本>-Setup.exe`。
- 本地接口测试：需带 `x-toonflow-workspace: 1` 和与 host 一致的 `Origin` 头，否则 403；用临时 TOONFLOW_DATA_DIR 与端口启动 `bun apps/server/src/index.ts`。

## 新工作目录与完整发布流程（2026-11-03）

- 桌面目录：D:\2api-codes\maimai\client；云端目录：D:\2api-codes\maimai\cloud。
- 日常使用 PowerShell。Windows 打包的完整快照入口为 `bun run release:desktop <新版本> --initial`；当前更新源为空，必须带 `--initial`。`package:desktop` 是底层安装包命令。
- 产物：D:\2api-codes\maimai\client\build\desktop\releases\<版本>。旧 2.1.0 安装包仍保留在旧 Toonflow-app 目录。
- `.hutch/devkit` 已存在，保留即可；旧 sync 说明只用于缺失时排障，使用前核对当前可执行文件及帮助，不修改全局代理配置。
- 详细步骤及当前源码核对结果见 [releaseWorkflow.md](releaseWorkflow.md)。
