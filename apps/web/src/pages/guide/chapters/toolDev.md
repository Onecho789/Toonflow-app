# 工具插件开发

工具插件给小麦同学增加新能力，例如联网搜索、调用某个网站的接口。一个插件可以提供多个工具。插件标识和工具调用名是两回事：下面的插件叫 `echoTool`，它提供的工具叫 `echoText`。

工具在本机服务进程里运行，可以使用 Bun、Node 内置模块和声明过的依赖。

## 最小示例

在源码仓库新建 `packages/tools/echoTool/`：

```text
packages/tools/echoTool/
  package.json
  tsconfig.json
  build.ts
  readme.md        # 可选，构建时嵌入为插件说明
  src/index.ts
```

**package.json**

```json
{
  "name": "@toonflow/tool-echo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun build.ts",
    "typecheck": "tsc"
  },
  "dependencies": { "zod": "^4.6.2" },
  "devDependencies": { "@toonflow/tools-scaffold": "workspace:*" }
}
```

**tsconfig.json**

```json
{
  "extends": "../../../tsconfig.base.json",
  "include": ["build.ts", "src"]
}
```

**build.ts**

```ts
import { createToolConfig } from "@toonflow/tools-scaffold";

await createToolConfig({
  name: "echoTool",
  displayName: "文本回声",
  description: "给输入文本添加前缀并返回结果。",
  author: "你的名字",
  github: "",
  prompt: "用户需要测试工具调用或明确要求返回带前缀的文本时，使用 echoText。",
  configRules: [{
    type: "input",
    field: "prefix",
    title: "文本前缀",
    value: "回声：",
    props: { maxlength: 100 },
  }],
}, import.meta.url);
```

**src/index.ts**

```ts
import { z } from "zod";
import type { ToolDefinition, ToolPlugin } from "@toonflow/tools-scaffold/runtime";

const configSchema = z.object({
  prefix: z.string().max(100).default("回声："),
}).strict();

const inputSchema = z.object({
  text: z.string().min(1).max(2000).describe("需要添加前缀的文本"),
}).strict();

const plugin: ToolPlugin = {
  validateConfig(config) {
    return configSchema.parse(config);
  },
  createTools(context) {
    const config = configSchema.parse(context.config);
    const tool: ToolDefinition = {
      name: "echoText",
      label: "文本回声",
      description: "在输入文本前添加用户配置的前缀，返回完整文本。",
      promptSnippet: "给文本添加已配置的前缀。",
      parameters: z.toJSONSchema(inputSchema, { io: "input", target: "draft-07" }),
      async execute(toolCallId, params, signal) {
        signal?.throwIfAborted();
        const { text } = inputSchema.parse(params);
        const result = config.prefix + text;
        return {
          content: [{ type: "text", text: result }],
          details: { text: result },
        };
      },
    };
    return [tool];
  },
};

export default plugin;
```

## 构建与安装

在仓库根目录运行：

```bash
bun install
bun run --cwd packages/tools/echoTool build
```

产物是 `build/tools/echoTool.tool.js`。「插件市场 › 安装插件」上传它，启用后在对话里说“调用 echoText，输入 hello”，应返回“回声：hello”。在插件的「配置」里改前缀，再发一条消息验证。

开发时运行 `bun run dev:plugins` 会直接同步到开发版客户端的数据目录，不用每次上传。直接复制覆盖文件可能仍跑旧代码，此时重启客户端或通过安装入口重装。

## 插件契约

| 接口 | 作用 |
| --- | --- |
| `validateConfig(config)` | 同步校验并返回规范化配置，失败抛错 |
| `createTools(context)` | 返回工具数组；缺少需要的能力时返回 `[]` |

| 工具字段 | 说明 |
| --- | --- |
| `name` | 调用名，小驼峰，所有插件之间不能重名 |
| `label` / `description` | 界面名称；给模型看的用途、输入和限制 |
| `parameters` | JSON Schema，用 `z.toJSONSchema` 生成 |
| `execute(toolCallId, params, signal)` | 执行并返回 `{ content: [{ type: "text", text }], details }` |
| `promptSnippet` / `promptGuidelines` | 系统提示里的一句话摘要 / 规则数组 |
| `executionMode` | 可选 `sequential` 或 `parallel` |

`execute` 里仍要用 Zod 再校验一次参数；把 `signal` 传给支持取消的请求；失败直接抛出明确的错误。

## 构建参数

| 字段 | 规则 |
| --- | --- |
| `name` | 必填小驼峰，最长 96 字符，与产物文件名一致 |
| `displayName` | 1–100 字符 |
| `description` | 必填，最多 2000 字符 |
| `author` / `github` | 必填，可为空字符串；github 只能是 `https://github.com` 地址 |
| `prompt` | 可选，插件共享的静态规则，最多 20000 字符 |
| `configRules` | 必填 form-create JSON 规则数组，最多 100 项，没有配置传 `[]` |

版本号自动读取 `package.json`，说明自动读取 `readme.md`。密码类配置可写 `props: { type: "password", showPassword: true }`。

## 宿主上下文 context

| 成员 | 用途 |
| --- | --- |
| `cwd` | 当前工作区绝对路径 |
| `config` | 本插件已校验的配置 |
| `resolvePath(path, readOnly?)` | 校验工作区边界后返回绝对路径 |
| `writeFile(path, content)` | 带锁的原子文本写入，父目录需已存在 |
| `ffmpeg(signal?)` | 取得 FFmpeg 工厂，用于音视频处理 |
| `media?` | `listModels`、`generateImage`、`generateVideo`、`generateAudio` |
| `canvas?` | 当前画布与节点操作 |
| `question?` | 向用户提问并等待作答 |
| `skills?` | 读写技能 |

带 `?` 的能力不一定存在，先判断再用。可参考仓库里 `packages/tools/` 下的内置工具，例如 `webFetch`、`workspace`。

## 常见问题

| 现象 | 检查 |
| --- | --- |
| 构建后没变化 | 是否重新安装或同步；必要时重启客户端 |
| 元数据或导出错误 | 文件名与 `name` 是否一致；默认导出是否含 `validateConfig` 和 `createTools` |
| 工具名重复 | 改 `ToolDefinition.name` |
| 启用后不可用 | 配置是否有效；`createTools` 是否因缺少上下文返回了 `[]` |

## 复制给 AI 的规则（工具插件）

```text
请为「麦麦工坊」写一个工具插件（Agent Tool），要求：
1. 放在源码仓库 packages/tools/<插件名>/，插件名小驼峰；包含 package.json、tsconfig.json、build.ts、readme.md、src/index.ts。
2. package.json：name 为 "@toonflow/tool-<短横线名>"，version "1.0.0"，private，type "module"，scripts { build: "bun build.ts", typecheck: "tsc" }，dependencies { zod: "^4.6.2" }，devDependencies { "@toonflow/tools-scaffold": "workspace:*" }。
3. tsconfig.json 继承 "../../../tsconfig.base.json"，include ["build.ts", "src"]。
4. build.ts 调用 createToolConfig({ name, displayName, description, author, github: "", prompt, configRules }, import.meta.url)，从 "@toonflow/tools-scaffold" 导入。configRules 是 form-create JSON 规则数组（field/title/value/props），没有配置传 []；API Key 做成 password 输入框配置项。
5. src/index.ts 默认导出 ToolPlugin（从 "@toonflow/tools-scaffold/runtime" import type）：
   - validateConfig(config) 用 Zod strict schema 同步校验并返回配置；
   - createTools(context) 返回 ToolDefinition[]，每个工具含 name（小驼峰）、label、description、promptSnippet、parameters（z.toJSONSchema(schema, { io: "input", target: "draft-07" })）、async execute(toolCallId, params, signal)。
6. execute 内先 signal?.throwIfAborted()，再用 Zod parse 校验 params，网络请求传入 signal；返回 { content: [{ type: "text", text }], details }；失败抛出明确的中文错误。
7. 读写文件只用 context.resolvePath / context.writeFile，路径限制在工作区内；context.media、context.canvas 等可选能力先判断存在。
8. 不写死密钥，不写测试文件，不加我没要求的依赖。
请输出所有文件完整内容，并给出构建命令：bun run --cwd packages/tools/<插件名> build
```
