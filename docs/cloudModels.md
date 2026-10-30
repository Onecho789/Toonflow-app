# 麦麦云模型

[返回开发指南](./development.md) · [Fork 改动记录](./forkChanges.md)

文本、图片、视频模型全部由麦麦云（独立仓库 `maimai-cloud`）的模型网关提供，客户端不保存任何上游地址或 Key。登录用户能用哪些模型、扣多少钱，都由云端按账号决定。

## 链路

1. 客户端不存任何 Key。登录或注册后只在 `data/settings.json` 的 `cloudSession` 保存会话（文件权限 0o600）；旧版残留的 `cloudSession.apiKey` 读取时忽略。
2. 所有模型请求由 `sessionFetch` 带登录会话的访问令牌（15 分钟有效，过期前自动刷新）发到 `${MAIMAI_CLOUD_URL}/v1`。云端返回 401 时强制刷新会话后重试一次，仍 401 视为未登录并清除本地会话。
3. 退出登录时作废云端会话；云端不可达只记日志，不阻止退出。

| 本机接口 | 云端网关 | 说明 |
| --- | --- | --- |
| `GET /api/ai/models` | `GET /v1/models`（`type: text`） | 文本模型；`meta.contextWindow`、`maxOutputTokens`、`reasoningEfforts` 决定上下文与思考档位。协议 `chat` → openai-completions，`responses` → openai-responses |
| `GET /api/ai/media/models` | `GET /v1/models`（`type: image/video`） | 媒体模型；`meta` 中的 `mode`、`durationResolutionMap`、`audio`、`imageSizes`、`imageRatios`、视频 `ratios` 原样给节点；视频节点比例按钮读取 `ratios`，缺省 `16:9`、`9:16`、`1:1` |
| `POST /api/ai/media/price` | 本地按 `pricing` 与 `meta` 估算 | 图片 `unit × sizePrices[size]`；视频 `unit × 秒数 × resolutionPrices[分辨率] × （有声时）audioPrice`；只做展示，以云端实际扣费为准 |
| `POST /api/ai/media/generate` | `POST /v1/images/generations`、`POST /v1/videos` | 图片同步返回 b64；视频每 5 秒查一次任务，最长 30 分钟，完成后从 `/content` 下载 |
| `POST /api/ai/media/balance` | `GET /v1/balance` | 返回 `{ balance, walletUrl }`，余额单位 0.0001 元 |

- 模型目录在进程内缓存 5 分钟；未登录时直接返回空列表，不请求云端。
- 所有模型统一使用 `providerId: "maimai"`。旧会话里保存的其他 `providerId` 按 `modelId` 匹配云端模型。
- 余额不足时网关返回 402，错误信息原样提示给用户。
- 暂不支持：音频生成、参考视频、非整数秒的视频时长。

## 界面

- 设置 →“文本模型”“媒体模型”：只读列出当前账号可用的模型，可刷新；没有添加、编辑、删除。
- 模型图标：`/v1/models` 的 `vendor`（lobehub 图标名，可为空串）透传到前端；非空时直接用该图标，否则按模型 ID 推断。画布节点的模型下拉通过 `@toonflow/node-shared/modelOption` 显示图标，图标组件由宿主经 `toonflowNodeHost.modelIcons` 提供。
- 设置 →“账号”：显示余额，“充值”打开云端 `/wallet` 页面。
- 画布右上角显示余额，进入工作区、窗口获得焦点、媒体生成结束后刷新；点击也可刷新。
- 切换账号后重新读取模型列表，并通知各生成节点刷新。

## 本地联调

```bash
TOONFLOW_DATA_DIR=<临时目录> TOONFLOW_SERVER_PORT=3917 MAIMAI_CLOUD_URL=http://127.0.0.1:8100 bun apps/server/src/index.ts
```

独立 server 模式下，媒体生成的工作区必须在 `<数据目录>/workspaces/` 下。真实上游按量收费，验证时每种模型只测一次，视频用最短时长。
