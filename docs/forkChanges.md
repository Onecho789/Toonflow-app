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
| 媒体模型页的“添加供应商”（内置 4 家）入口 | 不恢复。`addCustomProviderDialog.vue` 只保留自定义模式，上游给内置模式加的功能全部丢弃 | 只留自定义供应商 |
| 启动时自动安装内置媒体供应商（`providersRoot`、`autoInstallProviders`） | 不恢复。上游若修改这段逻辑，整段丢弃。合并后执行 `git grep -n "providersRoot\|autoInstallProviders" -- apps/server/src/app.ts`，应无结果（`utils/conf/index.ts` 里同名的 `autoInstallProviders` 是文本供应商的首次初始化，与此无关） | 媒体供应商简化接入 |
| 各端构建打包 `packages/providers/src` → `providers` 目录 | 不打包。上游若在构建脚本的目录列表中新增或保留 `providers`，合并时删掉 | 媒体供应商简化接入 |
| 安装器重置 `data/providers/initialized` | 不重置 | 媒体供应商简化接入 |

---

## 媒体供应商简化接入

- 提交：`eaecb97`（2026-10-27），分支 `codex/simplifyMediaModels`
- 状态：开发中
- 目的：自定义媒体供应商填 API 地址、协议、Key 并勾选模型即可接入，不必写 TS 代码；新增可配置的生图协议
- 详细说明：[mediaProviderConnection.md](./mediaProviderConnection.md)

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
- `docs/mediaProviderConnection.md`、`docs/forkChanges.md`（`docs/readme.md` 中有对应入口，见下表）

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

- 提交：见本节对应提交（2026-10-28），分支 `codex/simplifyMediaModels`
- 状态：第一版，只改界面显示文字
- 目的：产品名 Toonflow → 麦麦工坊（英文 MaiMai Studio，繁体 麥麥工坊），助手名 Toonflow 助手 / Toonflow Agent → 小麦同学（英文 Xiaomai）

### 改名范围

| 改了 | 没改（刻意保留） |
| --- | --- |
| Web 页面文案、通知标题、网页标题、首页与引导页品牌名、关于页标题 | 包名 `@toonflow/*`、`toonflowCanvas` 等文件标记字段、`x-toonflow-*` 请求头、`TOONFLOW_*` 环境变量、`toonflowData` 数据卷（改了会让已保存的项目打不开或要动整个工作区） |
| 服务端与 MCP 的报错文案、Agent 系统提示词（自称“小麦同学，麦麦工坊的 AI 创作搭档”） | 插件 `author: "Toonflow"` 与 `pluginMarket/index.vue` 中对它的判断（内置插件识别依赖这个值） |
| 桌面端菜单与窗口标题、启动窗口标题、移动端设备名 | 旧版供应商检测提示里的“旧版 Toonflow”“Toonflow 2.0”、技能中对上游 v1.1.8 的来源说明、上游仓库链接 |
| `packages/skills` 技能文案、媒体供应商 AI 提示词 | `User-Agent: Toonflow/2.0`、MCP 的 `realm="Toonflow"`、`URL:Toonflow Protocol` 等协议标识 |
| i18n：`messageSources.json` 与 21 份 `locales/*.json` 的键和译文 | 桌面安装器（`installer.nsi`）、Windows 原生程序（`native/*.cs`）、鸿蒙与安卓原生代码、`electrobun.config.ts` 应用名 |
| 根 `package.json` 的 description | README、关于页的作者、仓库地址、交流群与商务合作二维码 |

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

---

## 同步记录

| 日期 | 上游提交 | 说明 |
| --- | --- | --- |
| 2026-10-27 | `af6e884` | 合并 16 个提交，11 个文件冲突，按上表处理。上游自此要求 Bun 1.4.3（低版本下 undici 启动报错）。同步时 dev server 开着，stash 期间旧代码重启，把 4 个内置供应商装回了 `data/providers/`，2026-10-28 已删除，此后增加了第 0 步 |

## 本地数据处理

`data/` 被 Git 忽略，同步代码不会改动其中的文件；但旧代码运行一次就可能写入数据，且新代码不会自动清理。

**内置供应商被重新装回**：设置 → 媒体模型中出现 `tfRouter.ts`、`apiMart.ts`、`metaso.ts`、`compshare.ts` 时，在界面上逐个删除，删除接口会同时清理 `settings.mediaProviderConfigs` 中的配置。然后删掉 `data/providers/initialized`。不要用删除整个 `data/providers/` 的方式处理，那会把自定义的 `customMedia*.ts` 一起删掉。
