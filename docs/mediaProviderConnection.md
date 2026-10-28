# 媒体供应商简化接入

[返回开发指南](./development.md) · [Fork 改动记录](./forkChanges.md)

> 状态：开发中。已验证接口与类型检查，界面操作和真实平台生图尚未验证，见文末“待完善”。

本 fork（`Onecho789/Toonflow-app`）在上游基础上改造了“设置 → 媒体模型”的自定义供应商添加流程。目标是让中转站、OpenAI 兼容平台等常见服务**填表单即可接入**，不再必须编写 TypeScript 供应商代码。

## 与上游的区别

| | 上游 | 本 fork |
| --- | --- | --- |
| 添加自定义供应商 | 导入 / 粘贴 / AI 生成 `.ts` 供应商代码 | 填写 API 地址、协议、Key，勾选模型 |
| 获取模型列表 | 由供应商代码的 `modelsUrl` 决定 | 按所选协议自动请求 `/models`（OpenAI、Anthropic、Gemini） |
| 生图接口 | 每个供应商自行实现 `generateImage` | 选择可配置的“生图协议”，由宿主统一发起请求 |
| 特殊接口 | 写代码 | 仍可导入 `.ts` 适配文件，作为补充 |
| 内置供应商 | 启动时自动安装到 `data/providers/`，也可在“添加供应商”中选择 | 不自动安装，界面也不再提供内置供应商入口，只能添加自定义供应商 |

## 新增功能

### 1. 连接式自定义供应商

入口：设置 → 媒体模型 → 添加自定义媒体供应商（`customProviderForm.vue`）。

1. 填写供应商名称、API 地址、API Key，选择模型列表协议：OpenAI 兼容、Anthropic、Google Gemini。
2. 点击“获取模型”，拉取平台模型列表（`POST /api/providers/media/discover`）。
   - 支持 Anthropic `after_id` 与 Gemini `pageToken` 分页，最多 2000 个模型，可中途取消。
   - 刷新时保留已勾选但本次未返回的模型。
3. 勾选需要的模型（修改地址或模型列表协议时，已勾选的模型和它们的协议设置会保留），并为整个供应商选择默认生图协议；单个模型可选：继承默认、指定其他协议、仅保留模型列表（不进入生成节点）。
4. 保存（`POST /api/providers/media/configure`）后生成 `data/providers/customMedia<uuid>.ts`，文件内只有 JSON 配置：`modelConnection`、`listedModels`、`imageProtocolId`、`adapterSource`。API Key 单独存入 `settings.mediaProviderConfigs`。
5. 编辑时复用同一表单，带 `revision` 防并发覆盖；文件已保存但密钥保存失败时，重试只补存密钥。

模型能力规则：适配文件声明的模型优先；其余勾选的模型只有在选择了生图协议时才作为图片模型启用，尺寸与比例取自协议，不按模型名推断。走生图协议的模型不估价（`supportsPrice: false`）。

### 2. 可配置的生图协议

入口：设置 → 媒体模型 → 顶部切换到“生图协议”（`panels/imageProtocol/index.vue`，嵌在媒体模型页内），保存在 `settings.imageProtocols`。

- 内置默认协议（`packages/providers/src/imageProtocols.ts`）：
  - `openaiImages`：`/v1/images/generations` 与 `/v1/images/edits`（multipart）。
  - `geminiImages`：`/v1beta/models/{{modelName}}:generateContent`。
- 每个协议可配置：文生图 / 参考图接口路径、参考图请求格式（multipart 或 JSON）、图片文件字段、鉴权请求头与前缀、请求体 JSON 模板、结果读取路径（数组、URL、Base64、MIME）、尺寸与比例选项、尺寸映射。
- 模板变量白名单：`model`、`modelName`、`prompt`、`n`、`size`、`ratio`、`quality`、`outputFormat`、`images`、`parts`。服务端用 Zod 严格校验，拒绝未知变量和 `__proto__` 等保留字段。
- 接口路径与 API 地址自动去重版本前缀，例如地址以 `/v1` 结尾时不会拼出 `/v1/v1/...`。
- 删除仍被供应商引用的协议会被拒绝（HTTP 409）；`GET /api/imageProtocols/list` 同时返回各协议的引用情况。
- 新增协议时可选起始模板（OpenAI 兼容 / Gemini），只替换接口配置，保留已填的名称。
- 编辑器底部“测试生图”：用当前草稿（无需保存）选一个连接式供应商和模型，发一次文生图请求并预览结果（`POST /api/imageProtocols/test`）。API Key 由服务端从配置读取，不经过前端。上游返回错误时，报错会带上上游给出的原因。

### 3. 适配文件作为补充

视频、音频或非标准生图接口，可在自定义供应商表单中点击“导入供应商文件”（`providerAdapterDialog.vue`）：

- 支持选择 `.ts` 文件、粘贴代码或 AI 生成，最大 1 MB。
- 必须包含生成逻辑（`generateImage` / `generateVideo` / `generateAudio`），不能导入另一个连接配置。
- 源码作为 `adapterSource` 与连接配置一起原子保存；运行时宿主向适配文件注入 `this.config.apiUrl` 与 `this.config.apiKey`，其 rules 中的同名项不再重复显示。

### 4. 内置适配文件支持自定义地址

`apiMart`、`compshare`、`metaso`、`tfRouter` 读取 `this.config.apiUrl`，可作为连接式供应商的适配文件指向其他兼容地址；未配置时仍使用原默认地址。`metaso` 兼容旧的 `baseUrl` 配置。

### 5. 移除内置供应商自动安装

`createApp` 不再接收 `providersRoot`，桌面、移动、鸿蒙及 server 构建不再打包 `providers` 目录，安装器也不再重置 `data/providers/initialized`。已安装的供应商文件不受影响。

## 主要文件

| 位置 | 作用 |
| --- | --- |
| `apps/web/src/components/settings/panels/mediaModel/customProviderForm.vue` | 连接式供应商表单（新增、编辑共用） |
| `apps/web/src/components/settings/panels/mediaModel/providerAdapterDialog.vue` | 适配文件导入 |
| `apps/web/src/components/settings/panels/imageProtocol/index.vue` | 生图协议管理面板 |
| `apps/server/src/routes/providers/media/discover.ts` | 获取平台模型列表 |
| `apps/server/src/routes/providers/media/configure.ts` | 保存连接式供应商 |
| `apps/server/src/routes/imageProtocols/list.ts` | 读取生图协议及引用情况 |
| `apps/server/src/routes/imageProtocols/test.ts` | 用协议草稿测试生图 |
| `apps/server/src/utils/media/imageProtocols.ts` | 协议校验、请求模板渲染与生图请求 |
| `apps/server/src/utils/media/provider.ts` | 连接配置解析、模型合成、运行时接管生图 |
| `apps/server/src/utils/ai/models.ts` | 模型列表获取（新增 Gemini、取消信号、上限） |
| `packages/providers/src/imageProtocols.ts` | 默认生图协议与类型 |

## 待完善

- [ ] 浏览器中实际验证表单、获取模型、生图协议面板（含模板切换、测试生图）的交互与样式。
- [ ] 测试生图只测文生图，参考图接口需在画布中验证。
- [ ] 不支持“提交任务再轮询”的异步生图接口。
- [ ] 接入真实平台，验证选择协议后能在画布中生成图片。
- [ ] 已导入的适配文件只能更换，不能直接移除。
- [ ] 生图协议只覆盖图片；视频、音频仍需适配文件。
- [ ] 走生图协议的模型不支持估价与余额查询。
- [ ] 生图协议在加载供应商时读取；修改协议后，正在运行的生成任务仍使用旧配置。
