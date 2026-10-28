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
| `apps/server/src/utils/media/provider.ts` | `parseProvider` 解析 `modelConnection`、`listedModels`、`imageProtocolId`、`adapterSource`、`generationTypes`；`metadata` 按适配文件与生图协议合成 `models`；新增 `configureMediaProvider`；`loadMediaProviderSource` 接管走协议模型的 `generateImage`，并注入 `apiUrl`、`apiKey` | 两边都保留。上游对 schema、rules 的改动照收，我们的逻辑叠加在上面 |
| `apps/server/src/utils/ai/models.ts` | 导出 `modelConnectionSchema`、`listedModelsSchema`、`providerModelsUrl`；`fetchProviderModels` 支持 Gemini 和 Anthropic 分页、外部取消信号、2000 上限 | 保留我们的逻辑；上游只改提示文案时，采用上游文案 |
| `apps/server/src/utils/media/generation.ts` | `supportsPrice` 增加 `!model.imageProtocolId` 判断 | 保留这个判断，上游新增的字段（如 `rules`）照收 |
| `apps/server/src/routes/settings/save.ts` | schema 增加 `imageProtocols`；保存前检查被删协议是否仍被供应商引用，有则返回 409 | 采用上游的保存结构（目前是 `saveQueue` 串行），把引用检查放在 `previousSettings` 之后、写入之前 |
| `apps/server/src/utils.ts` | 导出 `imageProtocols` | 两边都保留 |
| `apps/server/src/app.ts` | 删除 `providersRoot` 参数、`autoInstallProviders`，以及自动安装供应商的整段逻辑 | 不恢复自动安装；上游新增的 import（如 `readdir`）按需保留，无用的 `readFile`、`createHash` 删掉 |
| `apps/server/src/index.ts`、`apps/desktop/src/index.ts`、`apps/mobile/src/server.ts` | 删除 `providersRoot` 传参 | 同上 |
| `apps/web/src/components/settings/panels/mediaModel/addCustomProviderDialog.vue` | custom 模式改用 `customProviderForm`，原导入代码与 AI 生成界面移到 `providerAdapterDialog.vue` | 模板保留我们的版本。上游对原导入界面的修改要同步到 `providerAdapterDialog.vue`，例如 `isMobile` → `actualPlatform.isMobile` |
| `apps/web/src/components/settings/panels/mediaModel/editProviderDialog.vue` | 连接式供应商改用 `customProviderForm` 编辑 | 两边都保留 |
| `apps/web/src/components/settings/panels/mediaModel/index.vue` | 列表显示可生成的模型数；连接式供应商的“获取模型”改为打开编辑 | 两边都保留 |
| `apps/web/src/components/settings/panels/mediaModel/types.ts` | `MediaProvider` 增加连接相关字段，新增 `MediaListedModel` | 两边都保留 |
| `apps/web/src/components/settings/panels/mediaModel/providerPrompt.ts` | “运行约定”中加入连接模式说明（注入 `apiUrl`/`apiKey`、模型列表协议不决定生成接口、不做模型 ID 映射），替换原“编辑界面按 rules 渲染”一条 | 保留上游新增的条目，我们的三条放在其后 |
| `apps/web/src/components/settings/index.vue` | 新增“生图协议”设置面板 | 两边都保留 |
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

## 同步记录

| 日期 | 上游提交 | 说明 |
| --- | --- | --- |
| 2026-10-27 | `af6e884` | 合并 16 个提交，11 个文件冲突，按上表处理。上游自此要求 Bun 1.4.3（低版本下 undici 启动报错）。同步时 dev server 开着，stash 期间旧代码重启，把 4 个内置供应商装回了 `data/providers/`，2026-10-28 已删除，此后增加了第 0 步 |

## 本地数据处理

`data/` 被 Git 忽略，同步代码不会改动其中的文件；但旧代码运行一次就可能写入数据，且新代码不会自动清理。

**内置供应商被重新装回**：设置 → 媒体模型中出现 `tfRouter.ts`、`apiMart.ts`、`metaso.ts`、`compshare.ts` 时，在界面上逐个删除，删除接口会同时清理 `settings.mediaProviderConfigs` 中的配置。然后删掉 `data/providers/initialized`。不要用删除整个 `data/providers/` 的方式处理，那会把自定义的 `customMedia*.ts` 一起删掉。
