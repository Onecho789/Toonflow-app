# Fork 改动记录

[返回开发指南](./development.md)

本文记录本 fork（`Onecho789/Toonflow-app`）相对上游（`HBAI-Ltd/Toonflow-app`）的每次改动，供同步上游时判断冲突文件中哪些是我们的、该保留谁。功能用法写在各自的说明文档中，此处只记合并需要的信息。

## 同步上游流程

0. 先停掉正在运行的 `bun run dev` 等开发服务。stash 或切换版本时，`--watch` 会用旧代码重启服务，可能改写 `data/` 下的数据，例如重新安装已移除的内置供应商。
1. `git fetch upstream`，用 `git diff --name-only HEAD upstream/master` 对照下方各条目的“改动了上游文件”表，预判冲突。
2. 合并后逐个处理冲突，按表中“冲突时的处理”操作；表中没有的文件，以上游为准。
3. `apps/server/src/router.ts` 不手工合并：取任一版本后在 `apps/server` 执行 `bun run routes` 重新生成。
4. 执行 `bun install`，再在 `apps/server`、`apps/web`、`apps/desktop` 执行 `bun run typecheck`，并执行根目录的 `bun run build:server`。
5. 在本文末尾的“同步记录”中补一行。

## 刻意不跟上游的地方

| 上游行为 | 本 fork 的处理 | 来源 |
| --- | --- | --- |
| 文本、媒体供应商的添加 / 编辑 / 删除，生图协议，供应商开发工具 | 不恢复。模型全部由麦麦云提供，上游对这些界面和接口的修改直接丢弃 | 麦麦云模型 |
| 启动时自动安装内置媒体供应商（`providersRoot`、`autoInstallProviders`） | 不恢复。上游若修改这段逻辑，整段丢弃。合并后执行 `git grep -n "providersRoot\|autoInstallProviders" -- apps/server/src/app.ts`，应无结果 | 媒体供应商简化接入 |
| 各端构建打包 `packages/providers/src` → `providers` 目录 | 不打包。上游若在构建脚本的目录列表中新增或保留 `providers`，合并时删掉 | 媒体供应商简化接入 |
| 安装器重置 `data/providers/initialized` | 不重置 | 媒体供应商简化接入 |

---

## 媒体供应商简化接入

- 提交：`eaecb97`（2026-10-27），分支 `codex/simplifyMediaModels`
- 状态：**已被“麦麦云模型”取代**。表单接入、生图协议和下表大部分新增文件已删除；只剩“刻意不跟上游的地方”里不自动安装、不打包内置供应商这几条仍然有效。下面的文件表留作历史，合并时以“麦麦云模型”一节为准

### 我们新增的文件

上游没有这些文件，合并不会冲突；上游若新增同名文件，需人工比对。

- `apps/server/src/routes/imageProtocols/list.ts`
- `apps/server/src/routes/imageProtocols/test.ts`
- `apps/server/src/routes/providers/media/configure.ts`
- `apps/server/src/routes/providers/media/discover.ts`
- `apps/server/src/utils/media/imageProtocols.ts`
- `apps/web/src/components/settings/panels/imageProtocol/index.vue`
- `apps/web/src/components/settings/panels/mediaModel/customProviderForm.vue`
- `apps/web/src/components/settings/panels/mediaModel/providerAdapterDialog.vue`
- `packages/providers/src/imageProtocols.ts`
- `docs/forkChanges.md`（`docs/readme.md` 中有对应入口，见下表）；原 `docs/mediaProviderConnection.md` 已改名为 `docs/cloudModels.md`

### 改动了上游文件

| 文件 | 我们改了什么 | 冲突时的处理 |
| --- | --- | --- |
| `apps/server/src/utils/media/provider.ts` | `parseProvider` 解析 `modelConnection`、`listedModels`、`imageProtocolId`、`adapterSource`、`generationTypes`；`metadata` 按适配文件与生图协议合成 `models`；新增 `configureMediaProvider`；导出 `mediaErrorMessage`（协议测试接口复用）；`loadMediaProviderSource` 接管走协议模型的 `generateImage`，并注入 `apiUrl`、`apiKey` | 两边都保留。上游对 schema、rules 的改动照收，我们的逻辑叠加在上面 |
| `apps/server/src/utils/ai/models.ts` | 导出 `modelConnectionSchema`、`listedModelsSchema`、`providerModelsUrl`；`fetchProviderModels` 支持 Gemini 和 Anthropic 分页、外部取消信号、2000 上限 | 保留我们的逻辑；上游只改提示文案时，采用上游文案 |
| `apps/server/src/utils/media/generation.ts` | `supportsPrice` 增加 `!model.imageProtocolId` 判断 | 保留这个判断，上游新增的字段（如 `rules`）照收 |
| `apps/server/src/routes/settings/save.ts` | schema 增加 `imageProtocols`；保存前检查被删协议是否仍被供应商引用，有则返回 409 | 采用上游的保存结构（目前是 `saveQueue` 串行），把引用检查放在 `previousSettings` 之后、写入之前 |
| `apps/server/src/utils.ts` | 导出 `imageProtocols` | 两边都保留 |
| `apps/server/src/app.ts` | 删除 `providersRoot` 参数、`autoInstallProviders`，以及自动安装供应商的整段逻辑 | 不恢复自动安装；上游新增的 import（如 `readdir`）按需保留，无用的 `readFile`、`createHash` 删掉 |
| `apps/server/src/index.ts`、`apps/desktop/src/index.ts`、`apps/mobile/src/server.ts` | 删除 `providersRoot` 传参 | 同上 |
| `apps/web/src/components/settings/panels/mediaModel/addCustomProviderDialog.vue` | 整个文件改为只包一层 `customProviderForm`：删掉内置供应商（builtin）模式和 `mode` 参数；原导入代码与 AI 生成界面移到 `providerAdapterDialog.vue` | 保留我们的版本，上游对内置模式的修改全部丢弃。上游对原导入界面的修改要同步到 `providerAdapterDialog.vue`，例如 `isMobile` → `actualPlatform.isMobile` |
| `apps/web/src/components/settings/panels/mediaModel/editProviderDialog.vue` | 连接式供应商改用 `customProviderForm` 编辑 | 两边都保留 |
| `apps/web/src/components/settings/panels/mediaModel/index.vue` | 删掉“添加供应商”（内置）按钮，只留“添加自定义供应商”；顶部加“供应商 / 生图协议”切换，生图协议面板嵌在这里；列表显示可生成的模型数；连接式供应商的“获取模型”改为打开编辑 | 两边都保留。整个模板外包了一层 `mediaModelPanel`，上游改列表时注意缩进 |
| `apps/web/src/components/settings/panels/mediaModel/types.ts` | `MediaProvider` 增加连接相关字段，新增 `MediaListedModel` | 两边都保留 |
| `apps/web/src/components/settings/panels/mediaModel/providerPrompt.ts` | “运行约定”中加入连接模式说明（注入 `apiUrl`/`apiKey`、模型列表协议不决定生成接口、不做模型 ID 映射），替换原“编辑界面按 rules 渲染”一条 | 保留上游新增的条目，我们的三条放在其后 |
| `apps/web/src/components/settings/index.vue` | 无改动（生图协议已并入媒体模型页，不再单独占一个菜单） | 直接采用上游 |
| `apps/web/src/stores/settings.ts` | 保存 `imageProtocols` 时刷新媒体模型 | 两边都保留 |
| `apps/web/src/types/components.d.ts` | 自动生成，新增 `CustomProviderForm` | 两边的条目都保留，按字母顺序排列 |
| `packages/providers/package.json` | exports 增加 `./imageProtocols` | 两边都保留 |
| `packages/providers/src/media/apiMart.ts` | `getBaseUrl(config)` 优先读 `config.apiUrl` | 上游的新功能照收，保留我们的 `getBaseUrl` 签名 |
| `packages/providers/src/media/compshare.ts` | 新增 `getBaseUrl(context, fallback)`，所有请求地址改为经它拼接 | 上游新增的请求地址也要改用 `getBaseUrl` |
| `packages/providers/src/media/metaso.ts` | rules 字段由 `baseUrl` 改为 `apiUrl`，兼容旧的 `baseUrl` | 保留我们的版本 |
| `packages/providers/src/media/tfRouter.ts` | 请求优先使用 `config.apiUrl` | 保留我们的版本 |
| `electrobun.config.ts`、`compat/macIntel/electrobun.config.ts` | 删除 `providers` 拷贝项 | 见“刻意不跟上游的地方” |
| `apps/server/scripts/build.ts`、`apps/mobile/scripts/build.ts`、`compat/ohos/build.ts` | 不再生成或拷贝 `providers` 目录 | 见“刻意不跟上游的地方”；上游在同一段的其他改动照收 |
| `apps/desktop/installer/initializeInstall.ts` | 重置列表去掉 `providers` | 见“刻意不跟上游的地方” |
| `apps/mobile/readme.md`、`docs/development.md`、`docs/readme.md` | 文档同步；`docs/readme.md` 新增“本 Fork 文档”一节和目录约定中的两行 | 两边都保留 |
| `apps/server/src/router.ts` | 自动生成 | 重新执行 `bun run routes` |

---

## 品牌改名：麦麦工坊

- 提交：`332abb3`（2026-10-28），分支 `codex/simplifyMediaModels`
- 状态：第一版，只改界面显示文字
- 目的：产品名 Toonflow → 麦麦工坊（英文 MaiMai Studio，繁体 麥麥工坊），助手名 Toonflow 助手 / Toonflow Agent → 小麦同学（英文 Xiaomai）

### 改名范围

| 改了 | 没改（刻意保留） |
| --- | --- |
| Web 页面文案、通知标题、网页标题、首页与引导页品牌名、关于页标题 | 包名 `@toonflow/*`、`toonflowCanvas` 等文件标记字段、`x-toonflow-*` 请求头、`TOONFLOW_*` 环境变量、`toonflowData` 数据卷（改了会让已保存的项目打不开或要动整个工作区） |
| 服务端与 MCP 的报错文案、Agent 系统提示词（自称“小麦同学，麦麦工坊的 AI 创作搭档”） | 插件 `author: "Toonflow"` 与 `pluginMarket/index.vue` 中对它的判断（内置插件识别依赖这个值） |
| 桌面端菜单与窗口标题、启动窗口标题、移动端设备名 | 旧版供应商检测提示里的“旧版 Toonflow”“Toonflow 2.0”、技能中对上游 v1.1.8 的来源说明、上游仓库链接 |
| `packages/skills` 技能文案、媒体供应商 AI 提示词 | `User-Agent: Toonflow/2.0`、MCP 的 `realm="Toonflow"` 等协议标识 |
| i18n：`messageSources.json` 与 21 份 `locales/*.json` 的键和译文 | 鸿蒙与安卓原生代码（安装器、原生程序和桌面标识见第二版） |
| 根 `package.json` 的 description | README（关于页的清理见第二版） |

### 冲突时的处理

上游几乎每次都会改到带 “Toonflow” 的文案，所以这一项冲突最多。

- 冲突行里上游改的是文案内容：采用上游的新内容，再把其中显示用的 “Toonflow” 换成“麦麦工坊”（中文与“麦麦工坊”之间不留空格）。
- i18n 字典：键是中文原文，必须和源码一致。上游新增或修改含 Toonflow 的文案后，源码、`zhCn.json`、`messageSources.json` 和其余 20 份译文的键要一起改。外文译文把 Toonflow 换成 MaiMai Studio，问候语中的助手换成 Xiaomai，繁体用“麥麥工坊”“小麥同學”。
- 合并后检查是否有漏网的显示文字（以下命令应只剩“没改”一栏中的条目）：

```sh
git grep -nP "(?<![-\w])Toonflow(?![-\w])" -- apps/web apps/server apps/desktop/src apps/mobile/src packages/mcp packages/nodeShared packages/nodeScaffold packages/tools packages/skills packages/startup/src packages/i18n/src/locales/zhCn.json
```

- 改名后新增了 6 个字典键（`麦麦工坊`、`小麦同学`、`退出麦麦工坊`、`麦麦工坊 Android`、`麦麦工坊 Logo`、`麦麦工坊 Skill`），原文是英文时不会被抽取，改成中文后才进字典，追加在各字典末尾。改完执行 `bun run --cwd packages/i18n extract`，抽取结果的键集合应与字典一致（顺序不同不要紧）。
- 不要为了消除冲突去改包名或 `toonflowXxx` 标识。

### 第二版：Logo、安装器、桌面标识、关于页

- 提交：`b3b9053`（2026-10-28），接着第一版做
- Logo：`packages/assets/` 下的 `logo.svg`、`logo.ico` 和 `logo.iconset/*.png` 全部换成麦麦工坊的徽章。PNG 和 ICO 用彩色原图按尺寸缩放。`logo.svg` 是同一徽章描出来的黑色单色剪影，因为网页里的用法（暗色反色、`mask-image`、加载页按绝对 `M` 轮廓拆分描边动画）都要求单色。上游改 Logo 时一律保留我们的版本。
- 原生启动动画 `packages/startup/assets/startup.json`：`logo` 图层的路径换成 `logo.svg` 的轮廓（最大轮廓放 `logoPen`，其余放 `logoBody`，填充改为 evenodd），`title` 图层换成 Noto Sans SC（SIL OFL）字重 600 的“麦麦工坊”轮廓，结尾位移按新宽度居中；时长、关键帧节奏和光晕未改。上游改动画时保留我们的 `logo`、`title` 路径，只合并时间轴变化。
- 安装器和原生程序的提示文字：`installer/installer.nsi`、`installer/checkWebView2.cs`、`native/protocolLauncher.cs`、`native/startupLauncher.cs`、`native/updateHelper.cs`、`scripts/macDmg.ts` 里显示的 Toonflow 改成“麦麦工坊”。User-Agent 改为 `MaiMaiStudio`，协议显示名改为 `URL:MaiMai Studio Protocol`。
- 桌面标识（改了以后，装过上游 Toonflow 的电脑上会被当成另一个应用，不会互相覆盖或更新）：

| 项 | 原值 | 新值 |
| --- | --- | --- |
| `electrobun.config.ts` 的 `app.name` | `toonflow` | `MaiMaiStudio`（Mac 包名 `MaiMaiStudio.app`） |
| `app.identifier`，以及 `windowsUpdater.ts`、`updateHelper.cs` 的校验 | `local.toonflow.desktop` | `local.maimaistudio.desktop` |
| URL 协议（`urlSchemes`、注册表 `Software\Classes\…`、`protocol.ts`、`protocolLauncher.cs`、插件安装链接文案与 i18n） | `toonflow://` | `maimai://` |
| 安装目录标记文件、注册表字段 | `toonflow.ini`、`toonflowInstallDirectory` | `maimai.ini`、`maimaiInstallDirectory` |
| `installer.nsi` 默认 `InstallDir` | `$LOCALAPPDATA\${appIdentifier}\stable` | `$LOCALAPPDATA\MaiMaiStudio`（“浏览”选盘时 NSIS 追加末级目录名，末级用产品名） |
| 互斥锁、计划任务名 | `ToonflowProtocol-`、`ToonflowUpdate-`、`ToonflowArchiveTool-`、`ToonflowUpdate_` | `MaiMai…` 同名前缀 |
| 安装包与 APK 文件名（`packageWindows.ts`、`release.ts`、`.github/workflows/*.yml`、`docs/development.md`） | `toonflow-<版本>-…` | `MaiMaiStudio-<版本>-…` |

- 这一版没改：网页与移动端内部的 `toonflow://save`、`toonflow://restart` 桥接，MCP 的 `toonflow://skills/` 资源 URI，`toonflow:confirm-quit` 等内部事件名，临时文件前缀（`toonflowWebView2-`、`toonflowUpdate-`、`toonflowDmg`），安卓包名 `com.toonflow.mobile`，鸿蒙代码，`release.baseUrl` 默认仓库，README 里的 `toonflow.app` 路径。
- 关于页（`settings/panels/about.vue`）删掉了 GitHub 仓库卡片、TF-Router 卡片、微信交流群二维码、赞助商面板（含“成为赞助商”二维码），`lib/tf.ts` 随之删掉 `getSponsorList` 和 `TfSponsor`。版本更新卡片保留。
- 工作区帮助菜单（`pages/workspace/index.vue`）只留“使用教程”，删掉“汇报 BUG”“加入交流群”“商务合作”和二维码弹窗。
- i18n：从 21 份译文和 `messageSources.json` 删掉了上面这些功能专用的 22 个键，并把安装链接文案里的 `toonflow://` 改成 `maimai://`。
- 冲突时：上游改了关于页或帮助菜单里被删掉的部分，直接丢弃上游那一块。上游改了安装器或原生程序，先采用上游内容，再按上表把标识和显示名换回我们的值。

---

## 麦麦云账号登录（第一期）

- 提交：`7fe6793`（2026-10-29），分支 `codex/simplifyMediaModels`；云端 `maimai-cloud` 首个提交 `429abfa`，已部署到 https://159.75.178.145:8100
- 状态：第一期，只做账号与客户端登录；网关计费、支付、管理后台在后续几期
- 目的：客户端接入自有云端账号服务 `maimai-cloud`（独立仓库，`D:\2api-codes\maimai-cloud`，Postgres + Redis）。设置页“账号”点登录 → 系统浏览器打开云端 `/login` → 登录后跳回 `maimai://auth?code&state` → 本机服务用 PKCE verifier 换取会话，存进 `data/settings.json` 的 `cloudSession`（0o600）
- 云端地址：默认测试服务器 `https://159.75.178.145:8100`，用环境变量 `MAIMAI_CLOUD_URL` 覆盖；正式域名定下后改 `apps/server/src/utils/cloud/index.ts` 的默认值
- 上游 TF-Router 登录（引导页、`tfAccount.vue`）这一期没动，两者并存

### 我们新增的文件

- `apps/server/src/utils/cloud/index.ts`：PKCE 登录、令牌刷新（合并并发刷新，刷新令牌每次轮换）、退出
- `apps/server/src/routes/cloud/login.ts`、`callback.ts`、`account.ts`、`logout.ts`：`POST /api/cloud/login`、`POST /api/cloud/callback`、`GET /api/cloud/account`、`POST /api/cloud/logout`，都要求 `x-toonflow-workspace` 与同源 Origin
- `apps/web/src/stores/cloudAccount.ts`、`apps/web/src/components/settings/panels/account.vue`

### 改动了上游文件

| 文件 | 改动 | 冲突时的处理 |
| --- | --- | --- |
| `apps/desktop/src/protocol.ts` | 新增 `isAuthUrl`、`parseAuthUrl` | 保留两个函数，`parseInstallUrl` 以上游为准 |
| `apps/desktop/src/index.ts` | `pendingInstalls`/`deliverInstall` 改名为 `pendingEvents`/`deliverEvent`，队列里放 `{ name, detail }`，`maimai://auth` 派发 `toonflow:cloud-auth` 事件 | 采用上游后重新套用改名，`openUrl` 按链接类型分流 |
| `apps/desktop/native/protocolLauncher.cs` | 无效链接提示不再只说安装链接 | 以上游为准，再改回这一句 |
| `apps/server/src/types/desktop.ts` | 新增 `CloudAuthCallback`、`CloudUser` | 保留 |
| `apps/server/src/utils.ts`、`utils/conf/index.ts` | 导出 `cloud`；conf 类型加 `cloudSession` | 保留 |
| `apps/web/src/lib/desktopProtocol.ts` | 监听 `toonflow:cloud-auth` 完成登录 | 保留监听，安装部分以上游为准 |
| `apps/web/src/components/settings/index.vue` | 设置列表最前面加“账号” | 保留这一项 |
| i18n 21 份字典与 `messageSources.json` | 追加 13 个键（账号、登录、退出登录、麦麦云相关报错等） | 追加在末尾，与源码一致 |

### 改为内置登录与启动登录页（提交 14b8439）

- 原因：系统浏览器跳回 `maimai://auth` 依赖浏览器放行自定义协议，用户的 Chrome 会拦截；改为应用内直接输入账号密码
- 打开客户端先显示登录页（`apps/web/src/components/loginGate.vue`），已登录才渲染路由；支持登录、邮箱验证码注册、首次登录强制修改初始密码，退出登录后回到登录页
- 会话仍存在主机 `data/settings.json` 的 `cloudSession`，桌面、网页开发模式、互联设备都跟随主机登录状态
- 离线：云端不可达（网络错误或 5xx）时沿用本地保存的账号进入；云端返回 401 才清掉会话
- 删除：PKCE 流程、`routes/cloud/callback.ts`、`CloudAuthCallback` 类型、`maimai://auth` 处理。上表中 `protocol.ts`、`desktop/src/index.ts`、`protocolLauncher.cs`、`desktopProtocol.ts` 四行已还原为上游内容，不再有冲突处理
- 新增路由：`POST /api/cloud/login`（改为直接用账号密码）、`register`、`code`、`password`；`utils/cloud/index.ts` 对应 `login`、`register`、`sendCode`、`changePassword`
- 设置页账号面板只显示邮箱、管理员标签和退出登录
- i18n：追加登录页 19 个键，删除浏览器登录专用的 6 个键（未登录、登录说明、登录失败、已登录、两条登录链接失效提示）
- 云端 `public/login.html` 里的桌面 PKCE 跳转客户端已不用，暂未删除

### 引导页去掉 TF-Router（提交 14b8439）

- `apps/web/src/pages/hello/index.vue`：删掉“登录 TF-Router 自动配置”按钮、TF-Router 登录 iframe 和自动写入 TF-Router 供应商的逻辑；主按钮改为“添加模型供应商”（进入原来的语言模型配置），保留设备互联和稍后配置
- i18n：删掉引导页专用的 16 个键，追加 2 个新文案键
- 冲突时：上游改了引导页的 TF-Router 部分，直接丢弃；其他部分以上游为准后再去掉 TF-Router 入口
- TF-Router 的账号、充值入口见下一节；其余残留这次没动

### 设置页去掉 TF-Router 账号与充值（提交 14b8439）

- 删除 `apps/web/src/components/settings/tfAccount.vue`、`tfRechargeDialog.vue`，并在 `types/components.d.ts` 删掉对应条目
- `settings/panels/languageModel/index.vue`：删掉 TF-Router 卡片的账号区、“官方”标签、置顶排序、单色 Logo 兜底，以及只给 TF-Router 用的“获取模型”按钮（连带 `saveProviderApiKey`、`fetchProviderModels` 和 `visible` 属性）；`settings/index.vue` 不再给它传 `visible`
- `settings/panels/mediaModel/index.vue`：同样删掉 TF-Router 的账号区、“官方”标签、置顶排序和 Logo 兜底
- `pages/workspace/panels/canvas/components/canvasMenu.vue`：画布右上角余额去掉 TF-Router 专用弹层（余额详情 + 充值），所有供应商统一为点击刷新
- `lib/providerBilling.ts`：去掉固定插入的 TF-Router 余额项、`tfBalanceApiKey`、`saveTfMediaApiKey` 和 `configured` 字段，只显示声明了 `supportsBalance` 的供应商；`getProviderBalance` 不再导出
- `lib/tf.ts`：删掉充值、订单相关接口和类型（`queryOrder`、`getRechargeData`、`pay`）
- `apps/server/src/utils/conf/index.ts`：首次启动不再自动写入 TF-Router 文本供应商，新用户的文本供应商列表为空
- i18n：删掉 42 个只在上述代码里用的键，同步 `messageSources.json` 中这些文件的来源路径
- 冲突时：上游改了上述 TF-Router 账号、充值、余额弹层或自动写入逻辑，直接丢弃；上游给 `providerBilling.ts` 的通用余额逻辑做的修改照常合并，再去掉其中的 tfRouter 特判
- 还没动的 TF-Router 残留：首页“探索”云端项目（`lib/tf.ts` 探索接口、`pages/home/explore*.vue`）、插件市场（TF-Router API Key 输入、`getPlugIn`）、`isTfRouterProvider`（`languageModel/add*Dialog.vue`）、服务端 `utils/media/provider.ts` / `billing.ts` / `generation.ts` / `utils/ai/initialize.ts` 的 tfRouter 特判、`packages/providers/*/tfRouter`、更新地址与匿名统计指向 api.toonflow.net（除插件市场和更新地址外，已在下一节清理）

### 首页探索、匿名统计与服务端 TF-Router 残留清理（提交 14b8439）

- 首页探索：删除 `pages/home/explore.vue`、`exploreDetail.vue`、`exploreProcess.vue`；`pages/home/index.vue` 去掉“探索”分区和侧栏入口；`lib/tf.ts` 删掉全部探索接口、类型和校验函数
- 匿名统计（上报 api.toonflow.net）：删除 `lib/anonymousData.ts`、`settings/panels/privacy.vue`（设置页“隐私”）；去掉 `main.ts`、`agent/conversation.vue`、`pages/hello/index.vue`、`pages/workspace/index.vue`、`workspace/panels/canvas/index.vue` 中的统计调用，`stores/settings.ts` 删 `privacySettings`，`types/components.d.ts` 删 Privacy 条目
- 添加供应商：`languageModel/addProviderDialog.vue`、`addCustomProviderDialog.vue` 去掉 `isTfRouterProvider` 特判和单色 Logo；`providerList.scss` 删 `.monochrome`；`modelPopover.vue`、`packages/nodeShared/src/groupNodeModels.ts` 去掉 tfRouter 置顶排序
- 内置供应商：删除 `packages/providers/src/media/tfRouter.ts` 及其 `package.json` 导出；`packages/providers/index.ts` 的文本、媒体列表不再包含 tfRouter
- 服务端：删除 `utils/ai/initialize.ts`（启动时刷新 TF-Router 模型），`app.ts`、`utils/ai/index.ts` 去掉对应调用和导出；`routes/settings/save.ts` 保存后不再刷新供应商模型；`utils/media/provider.ts` 去掉 tfRouter 的余额、价格补丁与模型地址兜底；`billing.ts` 去掉 tfRouter 的 Key 归一化；`generation.ts` 参考图顺序去掉 tfRouter；`modelContextLimits.ts` 删 TF-Router 注释
- i18n：删掉 105 个只在上述代码里用的键，同步来源路径
- 冲突时：上游改了上述探索、匿名统计、tfRouter 特判或启动刷新逻辑，直接丢弃；同文件的其他通用改动照常合并后再去掉 tfRouter 部分
- 保留：插件市场（`settings/panels/pluginMarket`、`lib/tf.ts` 的 `getPlugIn` / `toggleCollection` / `getTfApiKey` / `isTfRouterProvider`、`@toonflow/providers/language/tfRouter`）；桌面更新源见下一节；`stores/settings.ts` 仍处理保存接口已不再返回的 `customProviders`、`mediaProvider`、`modelRefreshErrors`

### 去掉内置更新源并关闭自动检查更新（提交 14b8439）

- `apps/server/src/utils/desktop/index.ts`：删掉官方源（api.toonflow.net）和 GitHub 源，更新只使用开发者选项里的自定义更新源；未填写时检查更新返回 400“尚未配置更新源”
- `routes/settings/save.ts`：删掉 `desktopUpdateSource`、`desktopAutoUpdate` 字段校验和“选择自定义源前须填地址”的校验；`utils/conf/index.ts` 的 `removeLegacySettings` 会清掉旧的 `desktopUpdateSource`
- `stores/desktopUpdate.ts`：删掉 `desktopAutoUpdate`、`desktopUpdateSource`、`registerDesktopAutoUpdate`（每 15 分钟检查）、`startDesktopUpdate`；`desktopUpdateKey` 直接取自定义地址。`main.ts` 启动时只读取一次本机更新状态，用来显示上次更新失败和更新说明
- `settings/panels/about.vue`：删掉更新源下拉框、自动更新开关和指向上游仓库的“前往下载页”；“检查更新”按钮保留，手动检查走自定义源
- `settings/panels/developer/index.vue`：保存自定义源时不再联动 `desktopUpdateSource`，说明文字改为“保存后在关于页检查更新时使用”
- i18n：删掉 6 个键，新增 2 个键（21 种语言）
- 冲突时：上游改了官方源地址、更新源切换或自动检查逻辑，直接丢弃；下载、安装、失败核验等通用更新流程照常合并
- 上游 GitHub 地址清空：`utils/desktop/index.ts` 安装失败的 `downloadUrl` 改为空字符串，`App.vue`、`about.vue` 在地址为空时不显示“前往下载页”，提示文字去掉“GitHub”；`about.vue` 删掉移动端“前往 GitHub 更新”按钮和 `repositoryUrl`
- `electrobun.config.ts` 的 `release.baseUrl` 改为空字符串；`apps/desktop/scripts/release.ts` 在地址为空时只允许 `--initial`，`--auto` 和增量发布会直接报错（CI 的 debug 工作流勾选 generatePatch 时同样会失败）
- i18n：再删 2 个键，新增 1 个键（21 种语言）
- `pages/home/index.vue`：删掉侧栏底部指向上游仓库的 GitHub 链接
- 有自有更新服务器后要改：`getUpdateBaseUrl` 加默认地址、`downloadUrl`、`release.baseUrl`，需要时从 git 历史找回 `registerDesktopAutoUpdate` 恢复自动检查

---

## 麦麦云模型

- 提交：`ddf727d`（2026-10-30），分支 `codex/simplifyMediaModels`；云端 `maimai-cloud` 同期提交 `c6e9d59`（模型网关统一协议与适配器）
- 状态：已上线。云端镜像 `1.2.0-202610300702` 于 2026-10-30 部署到 https://159.75.178.145:8100，3 个渠道、5 个模型已按本地联调配置导入（占位价）；线上文本、图片、视频各真实调用一次，扣费正确。部署前的库备份在服务器 `/opt/maimai-cloud/backups/maimai-202610300702.sql.gz`
- 目的：文本、图片、视频模型全部由麦麦云网关按登录账号提供，客户端不保存上游地址与 Key；本地供应商、媒体供应商、生图协议功能彻底移除，“文本模型”“媒体模型”菜单改为只读
- 详细说明：[cloudModels.md](./cloudModels.md)
- 旧配置：`removeLegacySettings` 会删除 `customProviders`、`mediaProviderConfigs`、`imageProtocols`。开发机的旧配置和 `data/providers/` 已备份到 `data/backup/cloudModels/`，作为云端渠道的导入来源

### 我们新增的文件

- `apps/server/src/utils/cloud/models.ts`：网关地址、网关请求（现为会话令牌，见“登录会话直连网关”）、模型目录缓存、余额
- `apps/server/src/utils/media/cloud.ts`：价格估算、图片与视频生成（视频轮询与下载）
- `docs/cloudModels.md`

### 删除的文件

- 服务端：`routes/providers/**`、`routes/imageProtocols/**`、`routes/ai/media/balanceEvents.ts`、`utils/ai/models.ts`、`utils/media/{provider,billing,debug,imageProtocols,priceReference,audioProcessor}.ts`
- 前端：`languageModel/add*Dialog.vue`、`mediaModel/` 下除 `index.vue` 外的全部文件、`imageProtocol/index.vue`、`developer/providerDebugDialog.vue`、`lib/providerBilling.ts`
- 上游改了这些文件：直接丢弃上游的修改

### 改动了上游文件

| 文件 | 改动 | 冲突时的处理 |
| --- | --- | --- |
| `apps/server/src/utils/ai/index.ts` | 模型来自 `listCloudModels`，`getConfiguredModel`、`listAiModels` 改为 async，provider 固定为网关地址 + 客户端 Key；删 `providerSchema`、`fetchProviderModels` | 保留我们的模型来源；上游对流式调用、参考素材的通用改动照收 |
| `apps/server/src/agent/runtime/{index,model,requests,sessions}.ts`、`routes/{agent,agents/a2a/save,singleAgent/run,ai/generate,ai/models}.ts` | 跟随上面改为 `await`；`requests.ts` 去掉 `customProviders` 查找 | 采用上游后补 `await` |
| `apps/server/src/utils/media/generation.ts` | 模型列表、价格、生成全部改走云端；音频返回“麦麦云暂未开放音频生成” | 保留我们的版本，上游对写盘、任务状态的通用改动照收 |
| `apps/server/src/routes/ai/media/balance.ts` | 返回麦麦云余额与充值页地址 | 保留我们的版本 |
| `apps/server/src/utils/cloud/index.ts` | 会话增加 `apiKey`，登录创建、退出删除客户端 Key（已被“登录会话直连网关”取代） | 我们的文件，保留 |
| `apps/server/src/routes/settings/save.ts`、`utils/conf/index.ts` | 删供应商与生图协议的 schema 和引用检查，返回值只剩 `nodeMenu`；清理旧字段 | 保留我们的版本 |
| `apps/server/src/utils/mcp/{operations,tools}.ts`、`utils/plugins/install.ts`、`types/desktop.ts`、`routes/desktop/plugins/install.ts` | 删媒体供应商操作与 `provider` 插件类型 | 上游新增的供应商相关操作直接丢弃 |
| `apps/web/src/stores/settings.ts` | 删 `customProviders`；`modelChoices` 由 `/api/ai/models` 构建（新增 `aiModels`、`loadAiModels`） | 保留我们的版本 |
| `apps/web/src/components/settings/panels/{languageModel,mediaModel}/index.vue` | 改为只读模型列表 + 刷新 | 保留我们的版本 |
| `apps/web/src/components/settings/panels/account.vue`、`stores/cloudAccount.ts` | 余额与充值入口；`useCloudBalanceRefresh` 替代 `providerBilling` | 我们的文件，保留 |
| `apps/web/src/pages/workspace/index.vue`、`panels/canvas/components/canvasMenu.vue` | 画布右上角只显示麦麦云余额 | 上游改余额面板时丢弃，其余照收 |
| `apps/web/src/components/modelPopover.vue` | 模型下拉不再按供应商分组 | 保留我们的版本 |
| `apps/web/src/App.vue` | 切换账号后重新读取模型并派发 `toonflow:provider-config-changed` | 保留这段 watch |
| `apps/web/src/pages/hello/index.vue`、`stores/hello.ts` | 引导页去掉“添加模型供应商”，只剩开始使用与设备互联 | 保留我们的版本 |
| `apps/web/src/components/settings/panels/developer/index.vue` | 删“供应商开发工具” | 上游改这一块直接丢弃 |
| `apps/web/src/lib/tf.ts`、`settings/panels/pluginMarket/index.vue` | 插件市场 Key 改存 `settings.tfApiKey`，不再写入供应商配置；删 `isTfRouterProvider` | 保留我们的版本 |
| `apps/web/src/lib/{mcpControl,desktopProtocol}.ts` | 删 `provider` 资源类型 | 保留 |
| `apps/web/src/components/settings/index.vue`、`providerList.scss` | 媒体模型面板不再传 `visible`；列表底部只剩刷新按钮 | 保留 |
| `packages/nodeScaffold/src/nodeAi.ts` | 媒体生成结束派发 `toonflow:media-generated`（刷新余额） | 保留这一句 |
| i18n 21 份字典与 `messageSources.json` | 重新提取；删除被移除功能的 391 个键 | 以 `bun run extract` 结果为准，译文删掉 zhCn 中不存在的键 |
| `apps/server/src/router.ts`、`apps/web/src/types/components.d.ts` | 自动生成 | 重新生成 |

---

## 登录会话直连网关

- 提交：`ca291ec`（2026-10-31），分支 `claude/cloudsessionauth-93d374`；配合云端 Go 版（`maimai-cloud` 分支 `goRewrite`，契约见其 `docs/apiContract.md`），Go 版部署前未做真实联调
- 目的：客户端不再创建和保存 `mm-` Key，网关请求直接带登录会话的访问令牌；模型下拉显示厂商图标；视频比例由云端模型配置下发
- 旧数据：本地 `cloudSession.apiKey` 读取时忽略，不迁移；TS 版云端账号 Key 列表里遗留的“麦麦工坊客户端”Key 不会再被使用，可在云端清理

### 我们新增的文件

- `packages/nodeShared/src/components/modelOption.vue`：模型图标 + 名称，节点模型下拉共用（导出 `@toonflow/node-shared/modelOption`）

### 改动了上游文件

| 文件 | 改动 | 冲突时的处理 |
| --- | --- | --- |
| `apps/server/src/utils/cloud/{index,models}.ts` | 删 `createApiKey`、`getApiKey`、`dropApiKey` 及登录建 Key、退出删 Key；新增 `sessionFetch`（只给麦麦云地址带令牌，401 强制刷新重试一次）与 `getAccessToken`；`CloudModel` 增加 `vendor` | 我们的文件，保留 |
| `apps/server/src/utils/ai/index.ts`、`agent/runtime/requests.ts` | provider 的 Key 改为访问令牌，SDK 请求的 fetch 换成 `sessionFetch`；文本模型透传 `vendor` | 上游改 fetch 传递时保留 `sessionFetch` 兜底 |
| `apps/server/src/utils/media/generation.ts`、`packages/toolScaffold/src/runtime.ts`、`packages/nodeScaffold/src/nodeAi.ts` | `MediaModel` 增加 `vendor`、`ratios`，`NodeAiModel` 增加 `vendor` | 合并时保留这几个可选字段 |
| `packages/modelIcons/src/{getModelIcon.ts,modelIcon.vue}` | 增加可选 `vendor`，非空且已收录时直接取该图标 | 保留 |
| `packages/nodeScaffold/index.ts`、`readme.md`、`apps/web/src/pages/workspace/panels/canvas/index.vue` | `@toonflow/model-icons` 设为节点 external，宿主经 `toonflowNodeHost.modelIcons` 提供 | 上游改 external 列表时补回这一项 |
| `packages/nodes/{textNode,imageGenerationNode,videoGenerationNode,audioGenerationNode,frameAnalysisNode,director3dNode,imageNode}` 模型下拉 | 选项与已选项前显示 `modelOption` 图标 | 上游改下拉时补回 `modelOption` |
| `packages/nodes/videoGenerationNode/src/index.vue` | 比例改读 `meta.ratios`，缺省 `16:9/9:16/1:1`；`setConfig` 按模型比例校验 | 保留我们的比例来源 |
| `apps/web/src/stores/settings.ts`、`components/modelPopover.vue`、`settings/panels/{languageModel,mediaModel}/index.vue` | 透传并使用 `vendor` | 保留 |
| `docs/cloudModels.md` | 链路改为会话令牌 | 我们的文件 |

---

## 设备级 mm- Key

- 提交：`9c36e8e`（2026-10-31），分支 `codex/simplifyMediaModels`；配合云端 `maimai-cloud` 的 `71f149f`（分支 `goRewrite`）
- 目的：取代“登录会话直连网关”。客户端改为只存这台设备的 `mm-` Key，Key 由云端在登录时签发，同一设备只保留一个；Windows 用 DPAPI 加密保存
- 旧数据：旧版保存的会话令牌按未登录处理，不迁移

### 我们新增的文件

- `apps/server/src/utils/cloud/protect.ts`：DPAPI 加密和解密（`bun:ffi` 调用 crypt32），其他平台原样返回

### 改动了上游文件

| 文件 | 改动 | 冲突时的处理 |
| --- | --- | --- |
| `apps/server/src/utils/cloud/index.ts` | 会话改为 `{ user, apiKey }`；登录、注册带 `deviceId`、`deviceName`；删除刷新令牌逻辑；`getAccessToken` 改为 `getApiKey`；401 时清除本地会话 | 我们的文件，保留 |
| `apps/server/src/utils/ai/index.ts` | provider 的 Key 改用 `getApiKey()` | 保留 |
| `apps/server/src/utils/conf/index.ts` | 配置类型增加 `cloudDeviceId` | 上游改这行类型时补回 |
| `docs/cloudModels.md` | 链路改为设备 Key | 我们的文件 |

---

## Agent 提问容错、推理档位与运行状态

- 提交：`10911b0`（2026-10-31），已合入 `codex/simplifyMediaModels`
- 目的：
  - askUser 收到空数组或同时传了 options 和 fields 时不再报错，校验失败返回中文错误；skillOperator 的报错同样改成中文
  - 推理档位只用云端下发的值（新字段 `meta.reasoning.efforts`，没有时用旧字段 `meta.reasoningEfforts`），都没有就隐藏选择器；选了“关闭”会发送 `off`，没选就不发；固定按 OpenAI 格式发送
  - 上下文窗口和最大输出各自取值，取不到的一项按顺序找下一个来源：云端 → `modelContextLimits.ts` → pi-ai 模型目录 → 默认值
  - 对话框在压缩提示旁边显示运行状态：运行中、调用某个工具、等待你回答、出错、已完成。“已完成”一直显示为灰色，不淡出

### 改动了上游文件

| 文件 | 改动 | 冲突时的处理 |
| --- | --- | --- |
| `packages/tools/askUser/src/index.ts` | 新增 `normalizeRequest`、`parseRequest`；更新 options 和 fields 的说明 | 上游改 schema 时保留这两个函数，再接上新的 schema |
| `packages/tools/skillOperator/src/index.ts` | 把 `parse` 换成 `safeParse` 并输出中文错误，`.strict()` 不变 | 保留 |
| `apps/server/src/lib/modelReasoning.ts` | 只保留 `thinkingLevels` 和 `ThinkingLevel` | 上游加了默认档位的，不采用 |
| `apps/server/src/utils/ai/index.ts` | `reasoningEfforts` 改为 `reasoningLevels`；`getModelReasoning(model, protocol)` 生成 `thinkingLevelMap` 和 `compat`；上下文窗口和最大输出各自回退 | 我们的文件，保留 |
| `apps/server/src/agent/runtime/model.ts` | `compat` 直接用模型自身的配置，不再强制设置 `supportsMidConvoEffort` | 保留 |
| `apps/server/src/agent/runtime/index.ts`、`types.ts` | 工具事件带上 `label`（工具显示名） | 上游改 `send` 时补回注入 label 的逻辑 |
| `apps/web/src/components/agent/conversation.vue` | 新增 `runStatus` 状态行和样式 | 保留 |
| `apps/web/src/components/modelPopover.vue` | 档位名改为 关闭/最少/低/中/高/超高/最高 | 保留 |
| `packages/i18n/src/**` | 新增 超高、最少、出错、等待你回答、运行中 · 调用 {0}、运行中…；删除 极高、最小 | 先跑 extract，再手工补另外 20 种语言 |

注意：本次 extract 还发现了与本次改动无关的漂移，是设备 Key 提交后云端相关的文案（3 个新增，4 个已废弃），本次没有处理，下次补字典时一起处理。

---

## 画布侧栏与媒体预览

- 提交：`9d23c33`、`a95e71c`（2026-10-31），已合入 `codex/simplifyMediaModels`
- 目的：画布左侧加入“画布 / 资产 / 提示词库”侧栏（定位、多选、筛选、缩略图、状态点），图片和视频节点支持放大预览，节点工具栏可复制提示词，`Ctrl/Cmd+A` 全选、`Esc` 取消选择，选中节点的媒体可打包成 zip 导出
- 生成状态：`useNodeGeneration` 把状态写进 `node.data.generationStatus`，保存画布时宿主会去掉 `running`

### 我们新增的文件

- `apps/web/src/pages/workspace/panels/canvas/components/canvasSidePanel.vue`：侧栏，宽度保存在 localStorage 的 `toonflow.canvasSidePanel`
- `packages/nodeShared/src/components/mediaPreview.vue`：全屏预览，支持图片缩放拖动、视频播放和多项切换，导出为 `@toonflow/node-shared/mediaPreview`
- `packages/nodeShared/src/components/copyPrompt.vue`：复制提示词按钮，导出为 `@toonflow/node-shared/copyPrompt`

### 改动了上游文件

| 文件 | 改动 | 冲突时的处理 |
| --- | --- | --- |
| `apps/web/src/pages/workspace/panels/canvas/index.vue` | 有画布时，素材库嵌入侧栏的“资产”页，与底部素材库按钮同步；新增全选和取消选择快捷键；保存时去掉 `generationStatus: "running"` | 保留上游改动，再补回这三处 |
| `apps/web/src/pages/workspace/panels/canvas/components/selectionToolbar.vue` | 新增“导出”按钮（fflate 打包，不压缩） | 补回按钮和 `exportMedia` |
| `apps/web/src/lib/canvasShortcuts.ts` | 新增 `selectAll`、`deselect` | 补回两项 |
| `apps/web/package.json` | 新增依赖 `@toonflow/node-shared`、`fflate` 0.8.3 | 补回 |
| `packages/nodeShared/package.json` | exports 增加 `mediaPreview`、`copyPrompt` | 补回 |
| `packages/nodeShared/src/useNodeGeneration.ts` | 状态写入 `node.data.generationStatus` | 补回 watch 一段 |
| `packages/nodes/{imageNode,imageGenerationNode,videoNode,videoGenerationNode}/src/index.vue` | 双击媒体打开 `mediaPreview`；生成节点工具栏加 `copyPrompt` | 保留上游改动，再补回 |

---

## 同步记录

| 日期 | 上游提交 | 说明 |
| --- | --- | --- |
| 2026-10-27 | `af6e884` | 合并 16 个提交，11 个文件冲突，按上表处理。上游自此要求 Bun 1.4.3（低版本下 undici 启动报错）。同步时 dev server 开着，stash 期间旧代码重启，把 4 个内置供应商装回了 `data/providers/`，2026-10-28 已删除，此后增加了第 0 步 |

## 本地数据处理

`data/` 被 Git 忽略，同步代码不会改动其中的文件；但旧代码运行一次就可能写入数据，且新代码不会自动清理。

**旧的供应商数据**：模型改由麦麦云提供后，`data/providers/` 已不再读取，`settings.json` 中的 `customProviders`、`mediaProviderConfigs`、`imageProtocols` 会在启动时被清掉。开发机的旧数据已备份到 `data/backup/cloudModels/`，确认云端渠道导入完成后再删除 `data/providers/`。
