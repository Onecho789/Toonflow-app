# 麦麦打包、发布与部署

2026-11-03 从旧对话、旧记忆和实际源码整理，2026-11-04 补充桌面 2.1.3、2.1.4、2.1.5、2.1.6、2.1.7、2.1.8、2.1.9、2.1.10、2.1.11、2.1.12、2.1.13、2.1.14、2.1.15、2.1.16、2.1.17、2.1.18、2.1.19、2.1.20、2.1.21 本地安装包交付记录及云端 2.12.0-20261104、2.13.0-20261105、2.14.0-20261105、2.14.1-20261105、2.15.0-20261105、2.15.1-20261105、2.15.2-20261105、2.16.0-20261105、2.16.1-20261105、2.16.2-20261105、2.16.3-20261105、2.16.4-20261105、2.17.0-20261106、2.18.0-20261106、2.19.0-20261106、2.19.1-20261106、2.19.2-20261106 发布。

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

当前桌面本地安装包为 **2.1.21**，源码已提交为 b933e1e（修复）、986b7cc（版本），分支 codex/simplifyMediaModels（2026-11-06 已推送 origin）；上次公开发布为 2.1.0。云端版本为 **2.19.2-20261106**，提交 65f93c9fe4b06fe0d40464b9c34eaed0dbeb45db，分支 uiRedesign（2026-11-06 已推送 origin）。两个版本号各自维护，后续先读实际 HEAD、分支和工作区。

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

### 本地完整安装包 2.1.21（2026-11-06）

- 源码：提交 b933e1e（Agent 停止时 partial 拷贝落盘、停止后工具拒绝写入；图片设置仅缓存过期时重读模型；删除无引用的 packages/providers）与 986b7cc（版本），工作区干净，已推送 origin codex/simplifyMediaModels。
- 构建命令：`bun run release:desktop 2.1.21 --initial`，退出 0；日志 docs/history/clearSecretRelease20261106/desktopBuild2121.log。
- 两次失败：第一次未前置 System32，GNU tar 报 `Cannot connect to D:`；第二次 go.microsoft.com 短链 ECONNRESET，直接重试成功。每次失败都在完整构建约 3–4 分钟后才出现，下次先做好这两项再打包。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.21。
- 安装包：`MaiMaiStudio-2.1.21-Setup.exe`，66,458,594 字节；SHA256 `a60506ad21f1e3c40fb303309fddde49ee71db7100a7ad848adee571db7c05b2`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,752,642 字节；SHA256 `d98e1f94fbed36a3a79627665cd650314c97b99299bdb4567e837f5ad99c2318`。
- 更新清单：`stable-win-x64-update.json`，210 字节；SHA256 `73a5b8292d1770de34254572396fcecbdfd3de23b3793e3b2db0550205352aa1`；version=2.1.21、stable/win/x64、hash=2svr92r4zkpzo。
- 验证：解包归档确认 version.json 为 2.1.21，bun/index.js 含 `redactedChunks` 与停止逻辑，imageGenerationNode 含 `nodeModelsAt`，无 providers 目录；临时解包目录已删除。未运行安装器。回退：安装 2.1.20 快照中的安装包。

### 本地完整安装包 2.1.20（2026-11-06）

- 源码：提交 3c74dc2（底色选中圈不再裁切、侧栏拖宽按帧更新、元素列表选中态加深、提示词库无选中时新建生成节点）与 ec9e15e（版本），工作区干净，安装包与 ec9e15e 一致。分支 codex/simplifyMediaModels，未推送。
- 构建命令：`bun run release:desktop 2.1.20 --initial`，退出 0；去掉代理变量、PATH 前置 System32，curl 取得的 CDN 地址传入 `webView2BootstrapperUrl`。日志 docs/history/canvasFixes20261106/desktopBuild2120.log。
- 两次失败：第一次与误启动的另一个并发构建争用文件（FileBusy，日志 desktopBuild2120-concurrentFailed.log），第二次 go.microsoft.com 短链 ECONNRESET（desktopBuild2120-econnreset.log）。第一次留下的残缺快照移到 build/desktop/discarded/2.1.20-concurrent，不作发布用。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.20。
- 安装包：`MaiMaiStudio-2.1.20-Setup.exe`，66,452,669 字节；SHA256 `c07f63d11d35a2346a66ad9c043ee66d39e5ecd5fcd3e01b8c7fea3455023493`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,770,955 字节；SHA256 `b73e03237b33c0f94e37dff1b57f230b30c993beb54d8b05cec18562df38ba6b`。
- 更新清单：`stable-win-x64-update.json`，210 字节；SHA256 `0df3d0c2313e8a18a1ef8191f32694e60dadc0a893c940a7dc57d1bedc2899d8`；version=2.1.20、stable/win/x64、hash=39jgp0t08qcuz。
- 验证：打包前 web typecheck 退出 0；快照与 artifacts 安装包 SHA256 一致；workspace chunk 含 `dragWidth` 与“生成节点并填入”。未运行安装器，未做运行时功能验收。回退：安装 2.1.19 快照中的安装包。

### 本地完整安装包 2.1.19（2026-11-06）

- 源码：提交 bfcd0bc（模型能力及时生效、节点报错自动关闭、Agent 停止卡住修复，未推送），**连同未提交的画布功能改动一起打包**：生成节点按提示词自动命名与副本编号、画布元素面板删除/右键菜单/失败重试、全画布按生成时间翻页预览、多图展开置顶、画布背景扩展（11 种图案、12 个组合主题、底色预设）、文件树引用检查覆盖 results；打包后已提交为 9db3832（功能）与 05b4776（版本），内容与安装包一致。详见 client/docs/forkChanges.md 2026-11-06 各节。
- 构建命令：`bun run release:desktop 2.1.19 --initial`，退出 0；去掉代理变量、PATH 前置 System32。日志 docs/history/canvasFeatures20261106/desktopBuild2119.log。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.19。
- 安装包：`MaiMaiStudio-2.1.19-Setup.exe`，66,453,023 字节；SHA256 `528afb61032e1037979a59ddfc7619839e13d228d41a36bcc7b27078b15a8005`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,753,816 字节；SHA256 `483a29c3eb5f212dbb1f7c94a21d356b704aa9dffc2d49323b8d0d092c974b15`。
- 更新清单：`stable-win-x64-update.json`，210 字节；SHA256 `ed289c3eef4f99bfa103d6e38621d10782cd177103a75a0608606c7a87d4faf5`；version=2.1.19、stable/win/x64、hash=2yz6cx6ax7eh4。
- 验证：打包前全仓 typecheck 退出 0；快照与 artifacts 安装包 SHA256 一致；构建产物 imageGenerationNode/videoGenerationNode.umd.js 含 labelLocked、按提示词重命名、retryGeneration、定位到节点，workspace CSS 含 `:has(.mediaResults)` 置顶，settings/workspace chunk 含 canvasBackgroundVignette。未运行安装器，未做运行时功能验收。回退：安装 2.1.18 快照中的安装包。

### 本地完整安装包 2.1.18（2026-11-06）

- 源码提交：b957380（版本），清理提交 3845158（删除未用依赖 lamejs、wavefile、@toonflow/providers 及 web 端 node-text/node-video，未用 import 与函数，仅文件内使用的导出改为非导出），分支 codex/simplifyMediaModels，3845158 已推送 origin。配套云端 2.19.1-20261106。
- **与 2.1.17 相同，连同工作区未提交改动一起打包**（节点报错自动关闭、停止按钮修复、节点模型缓存过期与刷新通知、router.ts、components.d.ts 漂移），安装包与任何单一提交都不完全对应。
- 注意：director3dNode 的 @tweenjs/tween.js、html2canvas-pro 是 threejson/core 的必需 peer，源码里搜不到 import 也不能删。
- 构建命令：`bun run release:desktop 2.1.18 --initial`，退出 0；去掉代理变量、PATH 前置 System32。日志 docs/history/cleanupRelease20261106/desktopBuild2118.log。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.18。
- 安装包：`MaiMaiStudio-2.1.18-Setup.exe`，66,448,863 字节；SHA256 `a4502193bf9452d36463ffa36959bd0cbec1ce1160fdef27c98f2952e3254582`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,767,614 字节；SHA256 `eefd4812a0f8cd4890964e205428adfc764b44aa564184c8b0de6dee4fc1ab76`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `8bcb2404a4a01e08fbfa2e1d0cbad0c9e5c767052313073db7fa5c3c5a9dbe5e`；version=2.1.18、stable/win/x64、hash=i2j5mh9a4lba。
- 验证：打包前 typecheck、build、build:nodes、build:server 退出 0；快照与 artifacts 安装包逐字节一致；Bun 解出归档 1650 个文件，version.json 为 2.1.18，director3dNode.umd.js 含 threejson infoPanel。未运行安装器，未做运行时功能验收。回退：安装 2.1.17 快照中的安装包。

### 本地完整安装包 2.1.17（2026-11-06）

- 源码提交：2883e58（版本），功能提交 e6a8bbe（429 后按 Retry-After 冷却、提交出图遇 429 自动重试），分支 codex/simplifyMediaModels，2026-11-06 已推送 origin（至 158717f）；工作区未提交改动未推送。配套云端 2.19.0-20261106。
- **按用户要求连同工作区未提交改动一起打包**：节点报错 6 秒自动关闭（nodeShared）、小助手停止按钮卡住修复（agent/runtime）、节点模型缓存 60 秒过期与设置页刷新通知（nodeScaffold、mediaModel、imageGenerationNode）及 router.ts、components.d.ts 漂移。这些改动未提交，安装包与任何单一提交都不完全对应。
- 构建命令：`bun run release:desktop 2.1.17 --initial`，退出 0；去掉代理变量、PATH 前置 System32。日志 docs/history/rateLimitRelease20261106/desktopBuild2117.log。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.17。
- 安装包：`MaiMaiStudio-2.1.17-Setup.exe`，66,448,783 字节；SHA256 `9ab86f2b1dbff04a025e20590aa6775e53d48d8480386f32b79a505ab3551698`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,744,445 字节；SHA256 `151a27cd9b9adbbdf2cc0bbe99985ee53a344a0f8dc6b5b5211dd0eae1e36e98`。
- 更新清单：`stable-win-x64-update.json`，210 字节；SHA256 `b77f12d3265125edce3b83f32fc5171477432f48c361f78c0a79a7976811a799`；version=2.1.17、stable/win/x64、hash=33lfiw0x48a6s。
- 验证：打包前 server tsc 退出 0，本地模拟服务验证 429 冷却（进度查询不受影响，下次提交等 Retry-After 后才发）；快照三资产与 artifacts 逐字节一致；Bun 解出归档 1650 个文件，version.json 为 2.1.17，app/bun/index.js 含 retry-after 冷却代码。未运行安装器，未在生产实际批量出图复验。回退：安装 2.1.16 快照中的安装包。

### 本地完整安装包 2.1.16（2026-11-06）

- 源码提交：d844475（版本），功能提交 c5873a8（gpt-image-2.6 GIF 动图）、cb47588（批量结果当前卡操作与副本位置）、4859d69（工具栏添加菜单锚定），分支 codex/simplifyMediaModels，2026-11-06 已推送 origin（至 9568676）。配套云端 2.18.0-20261106。
- 构建命令：`bun run release:desktop 2.1.16 --initial`，退出 0；去掉代理变量、PATH 前置 System32，curl 取得的 CDN 地址传入 `webView2BootstrapperUrl`。日志 docs/history/gifRelease20261106/desktopBuild2116.log。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.16。
- 安装包：`MaiMaiStudio-2.1.16-Setup.exe`，66,455,255 字节；SHA256 `ff1889f0a62f58b38ca9dda9e1215e324a74cd6a639c2c41a03d25e095248e3a`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,736,235 字节；SHA256 `9daa04f5e2e9b9f4e7ac69288bbe5d864496cd16c19f2594243fa9e989559c60`。
- 更新清单：`stable-win-x64-update.json`，210 字节；SHA256 `19cc57d90bc7a55e9449b185264a3a2ba0e2291aed004621b3c105c83be8b4ca`；version=2.1.16、stable/win/x64、hash=2nsac1xe27r5v。
- 验证：打包前 server tsc、imageGenerationNode vue-tsc 退出 0；快照与 artifacts 安装包逐字节一致；Bun 解出归档 1651 个文件，version.json 为 2.1.16，imageGenerationNode.umd.js 含 frame_duration_ms，app/bun/index.js 含 gifFramePrice。未运行安装器，未在界面实际出 GIF。router.ts、components.d.ts 工作区漂移未提交。回退：安装 2.1.15 快照中的安装包。

### 本地完整安装包 2.1.15（2026-11-05）

- 源码提交：e32a441（版本），功能提交 0bad74d，分支 codex/simplifyMediaModels，未推送 origin。内容：批量结果卡片按钮（36px、13px 加粗）、序号与节点「N 张」/打包下载徽标（36px、14px）加大；设置页分组框未选默认模型时提示先选模型，模型只有一个分组时说明。
- 构建命令：`bun run release:desktop 2.1.15 --initial`，退出 0；去掉代理变量、PATH 前置 System32，curl 取得的 CDN 地址传入 `webView2BootstrapperUrl`。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.15。
- 安装包：`MaiMaiStudio-2.1.15-Setup.exe`，66,447,493 字节；SHA256 `43371f13d58379c1bebb38ecfd34e06d1f97db97215c3193abaec20057b552e9`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,831,550 字节；SHA256 `55074b707c8a3090bb99b13c53f020610d4e90703bc74c4735ee26dd6740a2f5`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `4bbe2cd4a6640cdb11642beca9f141b0a85441aa547bed04b64fb2ca04f06a98`；version=2.1.15、stable/win/x64、hash=6ber37vpso4f。
- 验证：快照与 artifacts 安装包逐字节一致；用 Bun 解出归档 1737 个文件，version.json 为 2.1.15，imageGenerationNode.umd.js 含 36px 按钮样式，Web 资源含单一分组提示。两处改动已在 dev 预览中确认（未截到批量结果实物）；未运行安装器。

### 本地完整安装包 2.1.14（2026-11-05）

- 源码提交：d8581a7（版本），功能提交 bf74255，分支 codex/simplifyMediaModels，未推送 origin。内容：批量结果卡片的「拆为节点」改为「创建副本」，参照 infinite-canvas 新建同类型生成节点，带上提示词、模型与参数并接相同输入，输出换成所选结果。
- 构建命令：`bun run release:desktop 2.1.14 --initial`，退出 0；去掉代理变量、PATH 前置 System32，curl 取得的 CDN 地址传入 `webView2BootstrapperUrl`。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.14。
- 安装包：`MaiMaiStudio-2.1.14-Setup.exe`，66,446,444 字节；SHA256 `5d919909133ba6cd0c0aabdc2263376133887a5cc8a2576739ab176f60fba340`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,806,609 字节；SHA256 `07785218f0768891481927ae7aef68e25128bef5f3dfb7c38de721ec22a57d73`。
- 更新清单：`stable-win-x64-update.json`，210 字节；SHA256 `0e4a2207c9891e6b64a471eb5882b5b9e9499c3bf16e4b05e628c60361da4522`；version=2.1.14、stable/win/x64、hash=1josqdig9wgb5。
- 验证：快照与 artifacts 安装包逐字节一致；用 Bun 解出归档 1651 个文件，version.json 为 2.1.14，imageGenerationNode.umd.js 含创建副本与打包下载。创建副本、单张/打包下载已在 dev 预览中实测；未运行安装器。本机无 7-Zip/zstd 命令，归档检查改用 `Bun.zstdDecompressSync`。

### 本地完整安装包 2.1.13（2026-11-05）

- 源码提交：7bd1773（版本），功能提交 923567b 与 b6e30c7，分支 codex/simplifyMediaModels，未推送 origin（origin 停在 81ddd91）。内容：生成请求的模型既不在所设分组也不在 default 时不再自动取第一个分组，照原分组发送由云端提示可用分组；设置页切换分组成功提示；批量结果展开卡片布局、单张下载与打包下载（b6e30c7）。
- 构建命令：`bun run release:desktop 2.1.13 --initial`，退出 0；去掉代理变量、PATH 前置 System32，curl 取得的 CDN 地址传入 `webView2BootstrapperUrl`。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.13。
- 安装包：`MaiMaiStudio-2.1.13-Setup.exe`，66,442,818 字节；SHA256 `a91aa3a8f952afc58bca5777ec6ca2ecd43841a0a8fdf3bbff976912ae0e1d53`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,767,366 字节；SHA256 `f8f210fd9f39675f4ba3b3c5e065b13df1ec130799398d1dfc435ce8b3251ab9`。
- 更新清单：`stable-win-x64-update.json`，210 字节；SHA256 `a38736d886bc9d63c68fe512d3c68bd2eeb114f7f612a48cfa6dfaa26eb79db8`；version=2.1.13、stable/win/x64、hash=3kzilhbjnxzi3。
- 验证：web、server typecheck 退出 0；快照与 artifacts 安装包逐字节一致；归档解出 1650 个文件，version.json 为 2.1.13，bun/index.js 含新分组回退逻辑，cloudDefaultForm 产物含切换提示。未运行安装器，b6e30c7 的批量结果界面未做实际验收。
- 配套云端：`group_unavailable` 提示与当日计费修复在 cloud 工作区，尚未提交部署；未部署前新客户端遇到不可用分组仍显示旧文案“暂无可用渠道”。
- 本地交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。router.ts、components.d.ts 工作区漂移未提交。构建日志 docs/history/groupFixDesktop211320261105/。回退方式：安装 2.1.12 快照中的安装包。

### 本地完整安装包 2.1.12（2026-11-05）

- 源码提交：5a6cac1（版本），功能提交 88e04ee，分支 codex/simplifyMediaModels，已推送 origin。内容：深色三套背景调淡（近中性底色、柔光与光束约减半）；深色流星许愿改为程序生成的静态银河星空（1920×1200 离屏画一次并缓存 WebP，约 0.3 秒）。
- 构建命令：`bun run release:desktop 2.1.12 --initial`，退出 0；去掉代理变量、PATH 前置 System32，curl 取得的 CDN 地址传入 `webView2BootstrapperUrl`。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.12。
- 安装包：`MaiMaiStudio-2.1.12-Setup.exe`，66,444,608 字节；SHA256 `06236ca58091d5850945bf1cb6a6367012a669067971d67b80186d4072654f3b`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,805,059 字节；SHA256 `b76a42a695855a2bf9adb03f344a47240a462f068ac046752338b8aa9b2e6185`。
- 更新清单：`stable-win-x64-update.json`，210 字节；SHA256 `8b54b38aee76b7efe13e8e945d65f398589bb69b6f11c1d4c9ecdadd38d5406d`；version=2.1.12、stable/win/x64、hash=29rvy7ww9o08b。
- 验证：web typecheck 退出 0；开发预览量取深色三套柔光均值与星空分区颜色；快照与 artifacts 安装包逐字节一致；tar 列出归档 1737 项，version.json 为 2.1.12，Web 产物含新星空与晨曦底色。未运行安装器。
- 本地交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。router.ts、components.d.ts 工作区漂移未提交。构建日志 docs/history/darkBgDesktop211220261105/。回退方式：安装 2.1.11 快照中的安装包。

### 本地完整安装包 2.1.11（2026-11-05）

- 源码提交：21cb7da（版本），功能提交 17a20f7，分支 codex/simplifyMediaModels，已推送 origin（至 7e9505c）。内容：画布背景改用 infinite-canvas 配色（暖灰底色、半透明点阵/网格、间距 48、点固定屏幕尺寸）、项目自定义封面。
- 构建命令：`bun run release:desktop 2.1.11 --initial`，退出 0。首次因 go.microsoft.com 短链 ECONNRESET 失败（日志 build-attempt1-ECONNRESET.log），第二次用 curl 取得的 CDN 地址传入 `webView2BootstrapperUrl` 成功；均去掉代理变量、PATH 前置 System32。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.11。
- 安装包：`MaiMaiStudio-2.1.11-Setup.exe`，66,446,615 字节；SHA256 `7fbfd54b597dff2b9287f72efb6729cf8fb90be2f4f819382f72428b71ce7d3f`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,757,166 字节；SHA256 `9465fe4b536a8307336b623f7d2f2d252342d64ce732f0987f943c1272978416`。
- 更新清单：`stable-win-x64-update.json`，210 字节；SHA256 `590702c5ddbcf6ec5279344ee1a3957418eac04a1ad22323b3c6ad0370516c3c`；version=2.1.11、stable/win/x64、hash=1202i5zcf7vec。
- 验证：web typecheck 退出 0；开发预览中核对浅色/深色点阵与网格；快照与 artifacts 安装包逐字节一致；tar 列出归档 1737 项，version.json 为 2.1.11，mainview 的 workspace CSS 含新画布变量。未运行安装器。
- 本地交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。router.ts（仅换行符）、components.d.ts 工作区漂移未提交。构建日志 docs/history/canvasBgDesktop211120261105/。回退方式：安装 2.1.10 快照中的安装包。

### 本地完整安装包 2.1.10（2026-11-05）

- 源码提交：08e9423（版本），功能提交 e9d9a2f，分支 codex/simplifyMediaModels，已推送 origin。内容：自定义张数 1–15（配套云端 2.16.1-20261105 拆批）、图片工具栏自定义、本地 AI 超分（Real-ESRGAN + onnxruntime-web）。
- 构建命令：`bun run release:desktop 2.1.10 --initial`，退出 0。环境：PATH 前置 System32；curl 取得短链 301 的 CDN 地址（HTTP 200）传入 `webView2BootstrapperUrl`。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.10。
- 安装包：`MaiMaiStudio-2.1.10-Setup.exe`，66,451,890 字节；SHA256 `bb40ddcc3fadcf06ab1899ee00d2a3b945c1b798665a5e91ca6ada9e92fd6d85`。比 2.1.9 大约 11 MB，来自超分运行时 wasm（28.7 MB）与两份模型（约 7 MB）。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，69,744,481 字节；SHA256 `12e3f6cc9d67ea889ab244c4caf182f4c59eab93a84dc061853032893084ff0e`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `5b2a9a5a66d7f429f072aad5e51b43d359502bd3a892dc3c77709d93bd77f8d1`；version=2.1.10、stable/win/x64、hash=1l26nvfwrqov。
- 验证：快照与 artifacts 逐字节一致；Bun 解压归档 1735 项，version.json 为 2.1.10，views/mainview/superResolution/ 含运行时与模型共 5 个文件，imageNode/imageGenerationNode 插件含工具栏自定义与 AI 超分，app/bun/index.js 含 1–15 张校验；express.static 对 .mjs/.wasm 返回 text/javascript 与 application/wasm。未运行安装器。
- 本地交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。router.ts、components.d.ts 工作区漂移未提交。构建日志 docs/history/batchImageRelease20261105/desktopBuild2110.log。回退方式：安装 2.1.9 快照中的安装包。

### 本地完整安装包 2.1.9（2026-11-05）

- 源码提交：970bec1（版本），功能提交 565756f，分支 codex/simplifyMediaModels。内容：图片工具栏、多图堆叠展示、图像设置面板重排与 pixels 转发；配套云端提交 de59556（uiRedesign）尚未部署。
- 构建命令：`bun run release:desktop 2.1.9 --initial`，退出 0。环境：PATH 前置 System32。微软短链直连超时，经本机代理 curl 取得 301 的 CDN 地址传入 `webView2BootstrapperUrl`，脚本照常校验微软签名。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.9。
- 安装包：`MaiMaiStudio-2.1.9-Setup.exe`，55,620,929 字节；SHA256 `a32e20f4a1831ade5f497aabd3abb900452f7de3f24baaddd1b71988e3fbac81`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,282,182 字节；SHA256 `62d4d0bee590705ac03922b72bcc1a3973af56d49733d04eea03652939469f80`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `ea64aa55bad5cdc853e718754abf8451d094aa8d59c005a28446f4affa691707`；version=2.1.9、stable/win/x64、hash=2u2ec56c0xa9o。
- 验证：快照与 artifacts 逐字节一致；解压归档 version.json 为 2.1.9，imageGenerationNode/imageNode 插件含新设置面板、堆叠角标与反推提示词，app/bun/index.js 含 1–8 张校验；未运行安装器。
- 本地交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。router.ts、components.d.ts 工作区漂移未提交。回退方式：安装 2.1.8 快照中的安装包。

### 本地完整安装包 2.1.8（2026-11-05）

- 源码提交：cc5ba52（版本），功能提交 4d657b0，分支 codex/simplifyMediaModels。内容：图片像素补齐改用 infinite-canvas 固定尺寸表，表外按 gpt-image 约束换算，通用比例补 9:21，与云端 2.15.1-20261105 配套。
- 构建命令：`bun run release:desktop 2.1.8 --initial`，退出 0。环境：PATH 前置 System32。微软短链首次 ECONNRESET，curl 取 301 也握手失败，改用 2.1.7 记录的 CDN 地址传入 `webView2BootstrapperUrl`（先确认 HTTP 200），脚本照常校验微软签名。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.8。
- 安装包：`MaiMaiStudio-2.1.8-Setup.exe`，55,604,248 字节；SHA256 `5ec61d202d8997a8f4d2bec1a72dd113c8c9c0380f4815fcae731cb0612ccd0d`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,268,447 字节；SHA256 `e27c293bcd8c5e89527aa7fc5f918fe10af2f31da17c4419931c1a9d3727a9a1`。
- 更新清单：`stable-win-x64-update.json`，208 字节；SHA256 `021cdd7ab037d151e5444cdee49dbdd2b735f5c42246f234d1b618e65be06502`；version=2.1.8、stable/win/x64、hash=x8zkapnhcppb。
- 验证：打包前 server tsc 退出 0；快照与 artifacts 逐字节一致；解压归档共 1729 项，version.json 为 2.1.8，app/bun/index.js 含新尺寸表（2016x864）；未运行安装器。
- 本次为本地安装包交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。router.ts、components.d.ts 的工作区漂移未提交。构建日志 docs/history/sizeTableRelease20261105/desktopBuild218.log。回退方式：安装 2.1.7 快照中的安装包。

### 本地完整安装包 2.1.7（2026-11-05）

- 源码提交：40a134caa8991d15339c8528d1eb6cab69dbf183（版本），功能提交 0d79d2b，分支 codex/simplifyMediaModels。内容：后台未声明的尺寸、比例、时长、分辨率由客户端补通用选项，与云端 2.15.0-20261105 配套。
- 构建命令：`bun run release:desktop 2.1.7 --initial`，退出 0。环境：去掉代理变量、PATH 前置 System32。微软短链两次 ECONNRESET 或超时，第三次改用 `webView2BootstrapperUrl` 传入短链 301 指向的 msedge.sf.dl.delivery.mp.microsoft.com CDN 地址，脚本照常校验微软签名。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.7。
- 安装包：`MaiMaiStudio-2.1.7-Setup.exe`，55,603,645 字节；SHA256 `c68acf330ef374a98811270ff8b2cec51599b2cdfe75269981ccf0a84d21166d`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,240,727 字节；SHA256 `dc02c81ddd6551a864ff55d5d55114fdd0662a51d2b7aaa92e11d9563cac782d`。
- 更新清单：`stable-win-x64-update.json`，208 字节；SHA256 `2287cc1d2a0aa0457992fbef3645709884c17bfa011a54610674623ecc93845d`；version=2.1.7、stable/win/x64、hash=jvjp9gcgs7xc。
- 验证：
  - 打包前 server、web typecheck 退出 0；
  - 快照与 artifacts 逐字节一致；
  - 解压归档共 1729 项，version.json 为 2.1.7，app/bun/index.js 含通用比例列表；
  - NSIS 安装包未做 7-Zip 检查，未运行安装器。
- 本次为本地安装包交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。router.ts、components.d.ts 的工作区漂移未提交。构建日志在 docs/history/mediaDefaultsRelease20261105/desktopBuild217.log。回退方式：安装 2.1.6 快照中的安装包。

### 本地完整安装包 2.1.6（2026-11-05）

- 源码提交：6f9fa48（版本），功能提交 633bcd6，分支 codex/simplifyMediaModels。包含 @ 提及大图预览与画布节点高亮、节点标题短编号 `#xxxx`、悬浮对话框四边四角缩放 / 最大化 / 记住尺寸、askUser 长选项换行与三行折叠。
- 构建命令：`bun run release:desktop 2.1.6 --initial`，退出 0（去掉代理变量、PATH 前置 System32）。Bun 1.4.3；Windows x64。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.6。
- 安装包：`MaiMaiStudio-2.1.6-Setup.exe`，55,606,955 字节；SHA256 `7c99242eb18c10494626a78a261581fbd34dcdf721d0652b54ab3dda7aa4ba4c`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,265,355 字节；SHA256 `ca59f4b138cecb012216745685e0920b5f0d0a10f96d2aa4e8653d5c1ecbbdde`。
- 更新清单：`stable-win-x64-update.json`，208 字节；SHA256 `069facda1bcff54e68be57d9f9fabfaae6bae946925556f1127106c0c25f72c4`；version=2.1.6、stable/win/x64、hash=u1hkyk7bsm72。
- 验证：web、nodeScaffold、askUser vue-tsc 与 server tsc 退出 0；本地预览实测提及预览/高亮、对话框缩放/最大化/刷新恢复、长选项换行折叠与下拉换行。打包退出 0；快照与 artifacts 哈希一致；Bun 解压归档 1729 项，version.json 为 2.1.6，11 个节点插件均含短编号，askUser 含下拉换行样式，workspace chunk 含新对话框代码。NSIS 安装包未做 7-Zip 完整性检查。
- 本次为本地安装包交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。未运行安装器；router.ts、components.d.ts 的工作区漂移未提交。回退：安装 2.1.5 快照中的安装包。

### 本地完整安装包 2.1.5（2026-11-05）

- 源码提交：a643650cb324a9b49ed486de794557d177f5c4c7（版本），分支 codex/simplifyMediaModels。包含 2.1.4 之后全部客户端提交：messages 协议映射、分镜表与角色库、成片时间线、生成节点增强、画布组输入与 JSON 导入导出、角色库修复，以及 f7daa19 的 Claude 内置上限（claude-opus-5-5 等 1M / 128K）。
- 构建命令：`bun run release:desktop 2.1.5 --initial`，退出 0（去掉代理变量、PATH 前置 System32）。Bun 1.4.3；Windows x64。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.5。
- 安装包：`MaiMaiStudio-2.1.5-Setup.exe`，55,603,692 字节；SHA256 `564d51d824ba3ca15c308e300fe3f8c58c40badc89bef66d4f3be1b8d9eda9a0`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,277,069 字节；SHA256 `b83e5ccd3c91c4e427f28b10a718c6d369a23ec7dbd2532d0577a0eff0752cc2`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `9cd11cfa389a70ac62413856fdec83d7dc045c50e00accc4b83052e3c5a974f7`；version=2.1.5、stable/win/x64、hash=2otkef5rvimk0。
- 验证：server tsc 退出 0；打包退出 0；快照与 artifacts 哈希一致。本机未装 7-Zip，改用 Bun 解压归档核对：1729 项，Resources/version.json 为 2.1.5，11 个节点插件（新增 storyboardNode、timelineNode）齐全，app/bun/index.js 含 claude-opus-5-5 条目。NSIS 安装包未做 7-Zip 完整性检查。
- 本次为本地安装包交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。未运行安装器；router.ts、components.d.ts 的工作区漂移未提交。回退：安装 2.1.4 快照中的安装包。

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

2.19.2 发布构建上下文 D:\2api-codes\maimai\cloud\build\release219220261106，证据 docs/history/clearSecretRelease20261106/（liveTest.py 生产实测 20/20，测试后按快照恢复设置）；当前可回退镜像是 2.19.1-20261106；备份 /opt/maimai-cloud/backups/clearSecretRelease20261106；本次后台可清空邮件密码与易支付密钥、合并 audit，无迁移。2.19.1 发布构建上下文 D:\2api-codes\maimai\cloud\build\release219120261106（二进制与 web dist 均从独立 clone 构建，已删除 clone），证据 docs/history/cleanupRelease20261106/；当前可回退镜像是 2.19.0-20261106；备份 /opt/maimai-cloud/backups/cleanupRelease20261106；本次仅冗余代码清理、无迁移。2.19.0 发布构建上下文 D:\2api-codes\maimai\cloud\build\release219020261106（二进制与 web dist 均从独立 clone 构建，已删除 clone），证据 docs/history/rateLimitRelease20261106/（含 remoteRun.ps1：读 DPAPI 凭据、调用 D:\env\Python310\python.exe 执行 remoteRun.py）；当前可回退镜像是 2.18.0-20261106；备份 /opt/maimai-cloud/backups/rateLimitRelease20261106；本次限流改为后台配置、无迁移。2.18.0 发布构建上下文 D:\2api-codes\maimai\cloud\build\release218020261106（二进制与 web dist 均从独立 clone 构建，已删除 clone），证据 docs/history/gifRelease20261106/；当前可回退镜像是 2.17.0-20261106；备份 /opt/maimai-cloud/backups/gifRelease20261106；本次 GIF 动图、无迁移。2.17.0 发布构建上下文 D:\2api-codes\maimai\cloud\build\release217020261106（二进制与 web dist 均从独立 clone 构建，已删除 clone），证据 docs/history/maxImagesRelease20261106/；当前可回退镜像是 2.16.4-20261105；备份 /opt/maimai-cloud/backups/maxImagesRelease20261106；迁移 66 加可空列 channels.max_images，回退后列保留、旧镜像不读取。2.16.4 发布构建上下文 D:\2api-codes\maimai\cloud\build\release216420261105（二进制从独立 clone 构建，web/ 复用 2.16.3 dist），证据 docs/history/billingRelease20261105/；当前可回退镜像是 2.16.3-20261105；备份 /opt/maimai-cloud/backups/billingRelease20261105；本次仅服务端计费修复与 group_unavailable、无迁移。预检遇活动任务会自动中止，等待归零后重跑即可。2.16.3 发布构建上下文 D:\2api-codes\maimai\cloud\build\release216320261105（二进制与 web dist 均从独立 clone 构建，已删除 clone），证据 docs/history/nebulaRelease20261105/；当前可回退镜像是 2.16.2-20261105；备份 /opt/maimai-cloud/backups/nebulaRelease20261105；本次仅前端（星云梦境主题）、无迁移。2.16.2 发布构建上下文 D:\2api-codes\maimai\cloud\build\release216220261105（二进制与 web dist 均从独立 clone 构建，已删除 clone），证据 docs/history/glassIrisRelease20261105/；当前可回退镜像是 2.16.1-20261105；备份 /opt/maimai-cloud/backups/glassIrisRelease20261105；本次仅前端、无迁移。2.16.1 发布构建上下文 D:\2api-codes\maimai\cloud\build\release216120261105（独立 clone 编译，web/ 复用 2.16.0 dist），证据 docs/history/batchImageRelease20261105/；当前可回退镜像是 2.16.0-20261105；备份 /opt/maimai-cloud/backups/batchImageRelease20261105；本次无迁移。2.16.0 发布构建上下文 D:\2api-codes\maimai\cloud\build\release216020261105（二进制从临时独立 clone 编译，已删除 clone），证据 docs/history/uiRedesignRelease20261105/；当前可回退镜像是 2.15.2-20261105；备份 /opt/maimai-cloud/backups/uiRedesignRelease20261105；迁移 65 加 redemption_codes.code_cipher 列，回退后列保留、再次复制不可用。2.15.2 发布构建上下文 D:\2api-codes\maimai\cloud\build\release215220261105，证据 docs/history/pixelsRelease20261105/；当前可回退镜像是 2.15.1-20261105；备份 /opt/maimai-cloud/backups/pixelsRelease20261105；本次无迁移。注意：在 git worktree 里 go build 不写 vcs 信息，需从独立 clone 构建才能得到 vcs.revision。2.15.1 发布构建上下文 D:\2api-codes\maimai\cloud\build\release215120261105，证据 docs/history/sizeTableRelease20261105/（releaseRun.sh 为一次性发布脚本，remoteRun.py 用 DPAPI 凭据经 Paramiko 执行，可作下次模板）；当前可回退镜像是 2.15.0-20261105；备份 /opt/maimai-cloud/backups/sizeTableRelease20261105；本次无迁移。2.15.0 发布构建上下文 D:\2api-codes\maimai\cloud\build\release215020261105，证据 docs/history/mediaDefaultsRelease20261105/；其可回退镜像是 2.14.1-20261105；备份 /opt/maimai-cloud/backups/mediaDefaultsRelease20261105；本次无迁移。2.14.1 发布构建上下文 D:\2api-codes\maimai\cloud\build\release214120261105，证据 docs/history/maxOutputRelease20261105/。其可回退镜像是 2.14.0-20261105；备份 /opt/maimai-cloud/backups/maxOutputRelease20261105；迁移 64 清除 meta.maxOutputTokens，回退后该字段为空。2.14.0 发布构建上下文 D:\2api-codes\maimai\cloud\build\release214020261105，证据 docs/history/cachePricingRelease20261105/，其可回退镜像是 2.13.0-20261105；备份 /opt/maimai-cloud/backups/cachePricingRelease20261105，回退脚本同目录；迁移 62-63 只加列，回退旧镜像时列保留、缓存价不再生效。2.13.0 发布构建上下文 D:\2api-codes\maimai\cloud\build\release20261105，证据 docs/history/anthropicRelease20261105/，其可回退镜像是 2.12.0-20261104；备份 /opt/maimai-cloud/backups/anthropicRelease20261105，回退脚本同目录；本次无迁移。2.12.0 构建上下文 cloud\build\release20261104，证据 docs/history/pricingRelease20261104/，其可回退镜像是 2.11.0-20261103；备份 /opt/maimai-cloud/backups/pricingRelease20261104。2.12.0 起有迁移 57-61（model_pricing），回退旧镜像时新表保留、旧价格列仍可用。更早的可回退镜像是 2.10.3-202611030129；备份 /opt/maimai-cloud/backups/mailangRelease20261103。历史 releaseRollback.sh 固定了当次旧/新镜像与 envBefore/envAfter，不能直接用于未来新版本。它只恢复 IMAGE 并重建 app，保留新增表、兑换码、协议和账目，不自动恢复数据库。上次只验证过回退脚本语法，未执行生产回退。

## 保留与整理

本轮检查新目录未发现可直接清理的日志、临时文件或旧构建输出；.env、依赖、.hutch 和代码保留。云端 src/、public/ 仍标注为旧 TS 回滚版本，后续专门确认停止支持后再清理。

旧 Toonflow-app、maimai-cloud 目录含业务数据、安装包、未跟踪内容及关联工作树，不能按重复源码整目录删除。maimaiLinksBackup 是旧目录联接入口，不是当前源码实体。历史证据中的旧路径是当时事实，不表示今后继续在那里开发。

宣传视频资产 2026-11-06 从 Toonflow-app\promoVideo 移到 D:\2api-codes\maimai\promoVideo（493 个文件、298,544,724 字节，逐文件 SHA256 核对一致后删除旧位置；成片 maimaiStudioPromo.mp4 SHA256 7574576e1384d1ab4ee05a1009d9cbcd6c26710f0fc787c2f7a2c3b9a8e49cf8）。体积大，不进 Git；在 promoVideo 目录内运行脚本（其余路径为相对路径），capture.py、demoProject.py、gen.py 依赖 D:\2api-codes\maimaiDemo 演示工程，二者一起保留。

迁移来源：

- D:\2api-codes\ssh-server\maimaiCloud.md
- C:\Users\Administrator\.claude\projects\D--2api-codes-Toonflow-app\memory
- D:\2api-codes\.codexArtifacts\mailangRelease20261103

上述原件保留用于追溯。最新操作信息统一维护本目录，旧 deployServer.md 仅保存历史，不复制其过期操作建议到当前流程。

后续任务可直接使用：

```text
在 D:\2api-codes\maimai 工作，先读 AGENTS.md、docs/releaseWorkflow.md 和 docs/maimaiCloud.md；核对 client/cloud 各自 HEAD 与工作区，从本次指定版本继续打包、发布或部署，并将实际验证结果与回退位置更新回同一份记忆。
```
