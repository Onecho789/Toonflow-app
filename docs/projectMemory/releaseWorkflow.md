# 麦麦打包、发布与部署

2026-11-03 从旧对话、旧记忆和实际源码整理，2026-11-04 补充桌面 2.1.3、2.1.4 本地安装包交付记录及云端 2.12.0-20261104、2.13.0-20261105 发布。

## 工作目录与记忆

| 用途 | 位置 |
| --- | --- |
| 总工作目录 | D:\2api-codes\maimai |
| 桌面客户端 | D:\2api-codes\maimai\client |
| 麦麦云 | D:\2api-codes\maimai\cloud |
| 当前部署详情 | [maimaiCloud.md](maimaiCloud.md) |
| 本机环境 | [localEnvNotes.md](localEnvNotes.md) |
| 截至云端 2.9.0 的旧记录 | [history/deployServer.md](history/deployServer.md)（仅历史） |
| 麦浪版本发布证据 | [history/mailangRelease20261103](history/mailangRelease20261103) |

两个子目录分别管理 Git。根目录继续作为共享记忆维护入口；根级 AGENTS.md 与 docs/ 下的 releaseWorkflow.md、maimaiCloud.md、localEnvNotes.md 同步到两个仓库的 docs/projectMemory/ 并分别提交、推送，单独克隆时可从该目录的 readme.md 查看。每次更新共享记忆后同步两份副本；docs/history/ 中的历史证据与构建日志另作本机备份。

当前桌面本地安装包为 **2.1.4**，提交 92bae921a0df5e26245c3af6d8c0ce96a60dd464，分支 codex/simplifyMediaModels；上次公开发布为 2.1.0。云端版本为 **2.13.0-20261105**，提交 5838803a5c7a1548b063e7aeebcb8a8f3d41eb9b，分支 goRewrite。客户端 df0087a（messages 协议映射）已推送，未打包。两个版本号各自维护，后续先读实际 HEAD、分支和工作区。

## Windows 桌面打包

Bun 使用 package.json 要求的 1.4.3；保留 node_modules 和 .hutch/devkit。需要安装依赖时在 client 执行 bun install --frozen-lockfile。已有锁文件和包配置为准。

1. 在 client 检查 Git 改动，确定新的桌面版本；同步 electrobun.config.ts 的 app.version 和 client/docs/forkChanges.md，按本次任务提交需要发布的代码。
2. 在 PowerShell 中运行下列命令，替换版本槽位后再执行：

```powershell
Set-Location -LiteralPath 'D:\2api-codes\maimai\client'
bun run release:desktop <新的桌面版本> --initial
```

当前 electrobun.config.ts 的 release.baseUrl 为空，必须使用 --initial；--auto 也不能用于空地址。此时生成完整包，不生成增量 .patch。该命令通过 appVersion 临时传版本，不会自动修改配置文件。

3. 检查版本快照 D:\2api-codes\maimai\client\build\desktop\releases\<版本>，应包含：

- MaiMaiStudio-<版本>-Setup.exe
- stable-win-x64-MaiMaiStudio.tar.zst
- stable-win-x64-update.json

检查清单版本、平台、资产大小与 SHA256。已有版本快照不能覆盖。package:desktop 生成安装包；build:desktop 只构建程序且会清空部分构建产物，不能代替打包或用于保管历史版本。

4. 用户要求发布时，将自有 origin 上的确切提交关联到 maimai-v<版本>，创建 GitHub Release 草稿、上传上述三个资产，核对版本/大小/摘要后发布，并核对公开下载。
5. GitHub Release 和自有更新服务器是两条流程。publish:update 将快照交给独立更新服务器，不负责 GitHub 上传；更新源尚未配置，不能因发布了 GitHub Release 就宣称客户端自动更新可用。后续设置 release.baseUrl 并验证基线后才启用增量发布。

上次 GitHub Release：[maimai-v2.1.0](https://github.com/Onecho789/Toonflow-app/releases/tag/maimai-v2.1.0)。
上次安装包仍在 D:\2api-codes\Toonflow-app\build\desktop\releases\2.1.0\MaiMaiStudio-2.1.0-Setup.exe；本轮仅迁移记忆，没有迁移安装包。
其大小 55,545,262 字节，SHA256 121666428807e2bf6750735b9fd8d8f9ca8b79fc4ca1602739d8cc47fcad1afe。资产证据见 history/mailangRelease20261103/desktopGithubAssets.json。

### 本地完整安装包 2.1.1（2026-11-03）

- 源码提交：af1dd9803ef7f3d89fbee9a049d68f59209837cb，分支 codex/simplifyMediaModels。本轮提交画布工具栏、节点操作与版本配置；工作区剩余 AGENTS.md 为原有本机约定变更。
- 构建命令：`bun run release:desktop 2.1.1 --initial`，退出 0。Bun 1.4.3；Windows x64；完整重建前端、9 个节点插件、tools、ext 与 MCP。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.1。
- 安装包：`MaiMaiStudio-2.1.1-Setup.exe`，55,554,914 字节；SHA256 `4f18ccc3b377a58aef842fc6c2f76199e498557149320fd5e29d5959f9beec33`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,218,364 字节；SHA256 `9234733211b4b8c704438994f98f13871699502a86a939a880c44073b420c890`。
- 清单：`stable-win-x64-update.json`，208 字节；SHA256 `8f424c623d2b2820902fb8cfb198fae25fe9b8740fbcb23552ad5b86fd084e14`；版本 2.1.1、stable/win/x64、构建 hash `k3lwy0s95yh0`。
- 验证：NSIS 完整构建成功；7-Zip `t` 输出 `Everything is Ok`、退出 0；归档内版本、hash、Web入口及 9 个节点插件齐全。图片/生图节点已包含 nodeSelected、onNodeDragStop、onSelectionEnd 新逻辑。
- 本次为本地安装包交付；GitHub 最新公开版本仍是 2.1.0，更新源仍为空。未执行安装替换或登录后的画布体验验收。
- 原始源码备份、差异、修改后快照与7文件回退副本验证：`docs/history/canvasDesktop21120261103/`。回退副本恢复 2.1.0，7个SHA256与原始备份一致；当前工作区保留2.1.1。ROLLBACK.sh仅恢复源码文件，不撤销Git提交或更换已安装程序。
- 旧 2.1.0 安装包继续保存在上述历史位置，SHA256 已重新核对一致；共享记忆修改前副本保存在本次证据目录的 `memoryBefore/`。

### 本地完整安装包 2.1.2（2026-11-04）

- 源码提交：e863f07e43b60d59d90de3342d8cdd4dcfd20297，分支 codex/simplifyMediaModels。包含空白拖动平移、Ctrl/Space 临时框选、滚轮直接缩放、视图与主工具栏分组、画布外观面板；原有 AGENTS.md 修改保留。
- 构建命令：`bun run release:desktop 2.1.2 --initial`，退出 0。Bun 1.4.3；Windows x64；完整重建 Web、9 个节点插件、tools、ext、MCP 与桌面宿主。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.2。
- 安装包：`MaiMaiStudio-2.1.2-Setup.exe`，55,558,298 字节；SHA256 `4eb3b65d9d20b3ba3854cce5b43a8b6459d7b588037ed2324bae3c8bee4b3d87`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,257,193 字节；SHA256 `5e0da1e141583b5f32fb6629b35d394e4b26f4d5b833ce8dd93abbe711e85c1d`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `2409c0b58dcb195532e31688d4f04fcbb798c5f6e08468a2ce78180812d32906`；version=2.1.2、stable/win/x64、hash=3auovr8uo0d3d。
- 验证：桌面现有 typecheck 退出 0；NSIS 构建退出 0；7-Zip 完整性检查 `Everything is Ok`、退出 0。归档内版本与清单一致，Web 入口与 9 个节点齐全；压缩 Web 中确认 pan=None、zoom=None / Ctrl、selection=Ctrl / Space，以及外观/背景/滑条/临时框选标记。
- 交付为本地安装包，供用户安装测试；GitHub 公开版本仍为 2.1.0，更新源仍为空。未运行安装器或替换已安装程序，实际画布交互待用户验收。
- 源码原始/修改后快照、差异、日志、三资产摘要与回退验证：`docs/history/canvasDesktop21220261104/`。ROLLBACK.sh 在独立副本恢复 9 个文件，SHA256 全部匹配，配置恢复 2.1.1；当前源码及安装包保持 2.1.2。脚本仅恢复源码，不撤销提交或更换已安装程序。
- 旧 2.1.1 安装包保留在其原版本快照目录，SHA256 与旧记录一致；共享记忆修改前副本保存在本轮证据目录的 memoryBefore/。

### 本地完整安装包 2.1.3（2026-11-04）

- 源码提交：2a64f19e65085e431b2a14756ea7788d4fc1b2fa，分支 codex/simplifyMediaModels；包含功能提交 7dc6f0a 的默认小手与工具顺序调整，进入工作区固定 selectedTool=hand，顺序为「添加 → 小手 → 框选箭头」。
- 构建命令：`bun run release:desktop 2.1.3 --initial`，退出 0。Bun 1.4.3；Windows x64；完整重建 Web、9 个节点插件、tools、ext、MCP 与桌面宿主。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.3。
- 安装包：`MaiMaiStudio-2.1.3-Setup.exe`，55,555,910 字节；SHA256 `292d9cb3a27d6a95967ff88e6cba8acd3f55d64e482272abf2b7ef63972786e6`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,233,028 字节；SHA256 `b4afcb72333a9bb9d8ce4bf50e6f5792d553e127afd08ffa56e026f31fb813a3`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `3e6aea70f6736804ff21e0bae9807b651466001bf9ce33edb5d5f70c5c1cf011`；version=2.1.3、stable/win/x64、hash=24tflcod9m5bx。
- 验证：修改前后桌面现有 typecheck 均退出 0；完整打包退出 0；7-Zip 完整性检查输出 `Everything is Ok`、退出 0。三资产快照与 artifacts 哈希一致，包内版本与清单一致，Web 入口与 9 个节点齐全；workspace 主 chunk 与本次 Web 构建一致，包含固定 hand 默认值以及小手先于框选的按钮顺序。
- 本次为本地安装包交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。安装器留给用户运行测试，原有 AGENTS.md 修改保留。
- 构建日志、原始/修改后版本配置、差异及副本回退证据：`docs/history/canvasDesktop21320261104/`。ROLLBACK.sh 仅在独立配置副本恢复 app.version=2.1.2，SHA256 与原始配置一致；实际源码和产物保持 2.1.3，不更换已安装程序。
- 旧 2.1.2 安装包保留在其原快照目录；打包前已核对 SHA256 与旧记录一致。共享记忆修改前副本保存在本轮证据目录的 memoryBefore/。

### 本地完整安装包 2.1.4（2026-11-04）

- 源码提交：92bae921a0df5e26245c3af6d8c0ce96a60dd464（版本），修复提交 6edc944eb733324100ba604471f2175c2ae8a9ee，分支 codex/simplifyMediaModels，2026-11-04 已推送 origin。修复下载时「选择保存位置失败：EUNKNOWN: unknown error, uv_spawn」：saveFileDialog.exe 进程无法创建时改用系统 PowerShell 弹出同一另存为窗口；两者都失败时提示可能被火绒、360 等安全软件拦截。
- 构建命令：`bun run release:desktop 2.1.4 --initial`，退出 0（去掉代理变量、PATH 前置 System32）。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.4。
- 安装包：`MaiMaiStudio-2.1.4-Setup.exe`，55,557,551 字节；SHA256 `f2e9dcf70bd70383a7ca794eeb84f6c079a17d085d4d08ab76aac188bf4415c8`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,250,765 字节；SHA256 `cc32def22fa323dca8d672aa8c7aabc9b672f1caedfc26faf101b1f5439a9e81`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `5ae4e345ce53e9340ed22ea21b45128a5a9ceba82f9f1d810b959bf753624504`；version=2.1.4、stable/win/x64、hash=2tgxuqgucfqv9。
- 验证：desktop、i18n typecheck 退出 0；用安装包自带 Bun 1.4.0 复现同一 EUNKNOWN 后兜底窗口弹出，保存、取消、双重失败提示均按预期。打包退出 0；7-Zip `Everything is Ok`；三资产与 artifacts 哈希一致；归档 1727 项、9 个节点齐全，app/bun/index.js 含兜底代码。
- 本次为本地安装包交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。未运行安装器，真实安全软件拦截场景未复现。构建后 apps/web/src/types/components.d.ts 出现自动生成声明漂移，未提交。
- 证据与回退：`docs/history/saveDialogDesktop21420261104/`（VERIFICATION.txt、build.log、before/、fix.patch、ROLLBACK.sh、memoryBefore/）。ROLLBACK.sh 只在副本恢复 2.1.3 配置并已执行校验通过；撤回修复用 `git revert 92bae92 6edc944`。2.1.3 三资产 SHA256 构建前后不变。


## 云端镜像构建

当前生产使用 Go + Vue，Dockerfile 是 D:\2api-codes\maimai\cloud\server\Dockerfile。cloud 根目录 Dockerfile 属于旧 TS 回滚版本。

1. 在 cloud 核对并提交本次发布源码，确认工作树干净，记录最终提交；前端在 cloud\web 执行 bun run typecheck 和 bun run build，每步退出 0 后再继续。
2. 为本次版本新建独立镜像上下文，例如 cloud\build\release<时间>；先确认目的位置不存在。上下文内只需 maimai 二进制和 web/ 静态文件。
3. 在 cloud\server 交叉编译；命令槽位需替换，任务结束恢复原进程环境变量：

```powershell
Set-Location -LiteralPath 'D:\2api-codes\maimai\cloud\server'
$env:CGO_ENABLED = '0'
$env:GOOS = 'linux'
$env:GOARCH = 'amd64'
go build -trimpath -ldflags "-s -w -X maimai/internal/config.Version=<新的云端版本>" -o ../build/<本次上下文>/maimai ./cmd/maimai
go version -m ../build/<本次上下文>/maimai
```

核对 Go 构建记录中的 vcs.revision 为最终提交、vcs.modified=false、GOOS=linux、GOARCH=amd64、CGO_ENABLED=0。此前发生过提交前编译导致旧 HEAD+dirty，必须从最终提交重新构建后才能发布。

4. 用 PowerShell Copy-Item -LiteralPath 将本次 web\dist 复制成上下文的 web/，确保入口是 <上下文>\web\index.html，不能多嵌套一层 dist/。
5. 在 cloud 根构建并推送唯一新标签，命令形式如下，成功后再执行下一条：

```text
docker build --platform linux/amd64 -f server/Dockerfile --label "org.opencontainers.image.version=<版本>" --label "org.opencontainers.image.revision=<最终提交>" -t ccr.ccs.tencentyun.com/echotools/maimai-cloud:<版本> build/<本次上下文>
docker push ccr.ccs.tencentyun.com/echotools/maimai-cloud:<版本>
docker buildx imagetools inspect ccr.ccs.tencentyun.com/echotools/maimai-cloud:<版本>
```

记录 registry digest，部署端拉取后也需相同。源码、镜像标签、内嵌版本和 OCI revision 保持一致。

## 云端部署与回退

服务器 159.75.178.145，SSH root:22，工作目录 /opt/maimai-cloud。公网 https://159.75.178.145:8100，经 nginx 转发到本机 127.0.0.1:8101；Compose 应用端口为 8100。

凭据位置：

- SSH 首选 C:\Users\Administrator\.codex\serverConnections\maimaiCloud.xml（Windows DPAPI），配合 C:\Users\Administrator\.ssh\known_hosts 校验服务器身份。
- 麦麦工坊统一凭据文件：D:\2api-codes\资料\maimaiCredentials.md（明文，所在目录不在任何 Git 仓库内）。包含条目：
  - 部署服务器 159.75.178.145 的 root SSH 密码，以及服务器上运行的服务清单；
  - 麦麦云管理员账号 maimai@admin.com 及其密码；
  - 服务器 /opt/maimai-cloud/.env 的键名与值（POSTGRES_PASSWORD、SESSION_SECRET、EPAY_* 等）及 Compose 内派生的连接串；
  - 桌面客户端测试账号；
  - 镜像仓库 ccr.ccs.tencentyun.com 的登录状态说明；
  - new-api 服务器 154.29.148.65 的说明（不要操作）。
- 这里只保存位置和条目名；该文件不能复制进 client、cloud 或任何 Git 仓库，内容也不能抄进共享记忆、源码或发布记录。.env 及密码同样不复制。

发布前读取当前 IMAGE、digest、Compose、数据库迁移版本及活动图片/视频任务、未结算用量；活动任务或未结算用量非零时先处理或等待归零，再重建 app。为本次发布建立独立备份目录，备份数据库和部署配置，校验数据库归档可读，并准备与本次状态对应的回退脚本。

先在服务器显式拉取本次目标镜像并核对 digest；成功后再原子替换 /opt/maimai-cloud/.env 的唯一 IMAGE 行，保留其他字段与权限 600，并确认配置及任务状态没有并发变化。在 /opt/maimai-cloud 执行：

```sh
docker compose -f docker-compose.yml up -d --no-deps --wait --wait-timeout 60 --timeout 40 app
```

核对容器版本、running/restarts、Postgres、Redis、Bun、数据库迁移、活动任务、协议 current/previous，以及内网和公网 HTTPS 页面和接口。麦浪版本还检查 /wallet、/api/pay/config 以及匿名兑换/管理 API 的 401；本次 2.11.0 上线记录没有执行真实支付或创建生产兑换码。

每次成功发布后更新 maimaiCloud.md 与本文件，并保存本次版本的构建、发布、验收和回退证据。

2.13.0 发布构建上下文 D:\2api-codes\maimai\cloud\build\release20261105，证据 docs/history/anthropicRelease20261105/。当前可回退镜像是 2.12.0-20261104；备份 /opt/maimai-cloud/backups/anthropicRelease20261105，回退脚本同目录；本次无迁移。2.12.0 构建上下文 cloud\build\release20261104，证据 docs/history/pricingRelease20261104/，其可回退镜像是 2.11.0-20261103；备份 /opt/maimai-cloud/backups/pricingRelease20261104。2.12.0 起有迁移 57-61（model_pricing），回退旧镜像时新表保留、旧价格列仍可用。更早的可回退镜像是 2.10.3-202611030129；备份 /opt/maimai-cloud/backups/mailangRelease20261103。历史 releaseRollback.sh 固定了当次旧/新镜像与 envBefore/envAfter，不能直接用于未来新版本。它只恢复 IMAGE 并重建 app，保留新增表、兑换码、协议和账目，不自动恢复数据库。上次只验证过回退脚本语法，未执行生产回退。

## 保留与整理

本轮检查新目录未发现可直接清理的日志、临时文件或旧构建输出；.env、依赖、.hutch 和代码保留。云端 src/、public/ 仍标注为旧 TS 回滚版本，后续专门确认停止支持后再清理。

旧 Toonflow-app、maimai-cloud 目录含业务数据、安装包、未跟踪内容及关联工作树，不能按重复源码整目录删除。maimaiLinksBackup 是旧目录联接入口，不是当前源码实体。历史证据中的旧路径是当时事实，不表示今后继续在那里开发。

迁移来源：

- D:\2api-codes\ssh-server\maimaiCloud.md
- C:\Users\Administrator\.claude\projects\D--2api-codes-Toonflow-app\memory
- D:\2api-codes\.codexArtifacts\mailangRelease20261103

上述原件保留用于追溯。最新操作信息统一维护本目录，旧 deployServer.md 仅保存历史，不复制其过期操作建议到当前流程。

后续任务可直接使用：

```text
在 D:\2api-codes\maimai 工作，先读 AGENTS.md、docs/releaseWorkflow.md 和 docs/maimaiCloud.md；核对 client/cloud 各自 HEAD 与工作区，从本次指定版本继续打包、发布或部署，并将实际验证结果与回退位置更新回同一份记忆。
```
