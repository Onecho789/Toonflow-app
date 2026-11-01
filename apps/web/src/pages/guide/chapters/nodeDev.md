# 节点插件开发

节点插件给画布加一种新积木。它是一个 Vue 3 + TypeScript 包：`createNodeConfig` 定义构建信息，`defineOptions` 声明端口，`useNode` 取得节点状态。浏览器里用的代码统一从 `@toonflow/nodes-scaffold/runtime` 导入。

## 最小示例：便签节点

在源码仓库新建 `packages/nodes/noteNode/`：

```text
packages/nodes/noteNode/
  package.json
  tsconfig.json
  vite.config.ts
  readme.md        # 插件说明，例如“在画布中编辑短文本，通过 text 端口输出”
  src/index.vue
```

**package.json**

```json
{
  "name": "@toonflow/node-note",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch",
    "typecheck": "vue-tsc --noEmit"
  },
  "peerDependencies": {
    "vue": "^3.5.42",
    "@vue-flow/core": "^1.48.2",
    "element-plus": "^2.14.5"
  },
  "devDependencies": {
    "@toonflow/nodes-scaffold": "workspace:*",
    "typescript": "~6.0.3",
    "vite": "^8.2.2",
    "vue-tsc": "^3.3.11"
  }
}
```

**tsconfig.json**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

**vite.config.ts**

```ts
import { createNodeConfig } from "@toonflow/nodes-scaffold";

export default createNodeConfig({
  name: "noteNode",
  displayName: "便签",
  author: "你的名字",
  github: "",
}, import.meta.url);
```

**src/index.vue**

```vue
<template>
  <nodeSkeleton v-bind="nodeProps">
    <textarea
      v-model="outputs.text.value"
      class="noteEditor nodrag nopan nowheel"
      aria-label="便签文本"
      @pointerdown.stop
      @mousedown.stop
      @dblclick.stop
      @keydown.stop />
  </nodeSkeleton>
</template>

<script setup lang="ts">
import { nodeSkeleton, useNode, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";

defineOptions({
  inheritAttrs: false,
  handles: [
    { id: "text", type: "source", dataType: "STRING", label: "文本输出" },
  ] satisfies NodeHandle[],
});

const { nodeProps, outputs } = useNode({
  label: "便签",
  outputs: { text: { dataType: "STRING", value: "" } },
});
</script>

<style scoped>
.noteEditor {
  box-sizing: border-box;
  width: 280px;
  min-height: 120px;
  resize: vertical;
}
</style>
```

几个要点：

- `inheritAttrs: false` 防止画布属性覆盖节点骨架。
- 可交互的元素加 `nodrag nopan nowheel` 类名并阻止事件冒泡，否则编辑时会拖动画布或触发快捷键。
- 输出会随画布一起保存，重新打开后自动恢复。短文本可以直接存；长正文和图片视频要存成工作区文件。

## 构建与安装

在仓库根目录运行：

```bash
bun install
bun run --filter '@toonflow/node-note' build
```

产物是 `build/nodes/noteNode.umd.js`，「插件市场 › 安装插件」上传即可，画布的添加节点菜单里会出现「便签」。

边改边看：一个终端运行 `bun run --filter '@toonflow/node-note' dev`（监听构建并同步到开发数据目录），另一个终端运行 `bun run dev` 启动开发版客户端。改完点节点标题栏刷新，或刷新页面。

产物是单个 JS 文件，样式会打进去；独立的字体、图片文件不会随插件安装，发布前检查。

## 构建参数与配置

| 字段 | 说明 |
| --- | --- |
| `name` | 唯一小驼峰标识，决定文件名 |
| `displayName` | 显示名称，不能为空 |
| `author` / `github` | 可为空；github 只能是 `https://github.com` 地址 |
| `configRules?` | 可选 form-create JSON 规则，最多 100 项 |

版本号读 `package.json`，说明读 `readme.md`。配置在脚本里用 `useNode().config.value.字段名` 读取，同类型节点共用一份。配置会下发到页面，不要当作保存秘密的地方。

## 端口与输出

端口格式 `{ id, type, dataType, label? }`：`target` 是输入，`source` 是输出。`outputs` 的键要和 source 端口的 id 一致。

| 类型 | value |
| --- | --- |
| `STRING` | 字符串 |
| `INT` / `FLOAT` | 整数 / 数值 |
| `BOOLEAN` | 布尔值 |
| `IMAGE` / `MASK` / `VIDEO` / `AUDIO` | `{ url: "assets/...", mimeType: "image/png" }`，url 是工作区相对路径 |

接收输入：加一个 `{ id: "in", type: "target", dataType: "STRING" }` 端口，然后：

```ts
const { nodeEvent } = useNode(/* 同上 */);

nodeEvent.on("input:in", values => {
  const input = values.find(item => item.dataType === "STRING" && typeof item.value === "string");
  if (typeof input?.value === "string") outputs.value.text.value = input.value;
});
```

输入是数组，上游还没产出时 value 是 `undefined`。

## useNode 返回值

| 成员 | 用途 |
| --- | --- |
| `id` / `node` | 节点 ID 与画布节点；可序列化的业务状态可写进 `node.data` |
| `nodeProps` | 传给 `nodeSkeleton` |
| `handles` / `outputs` | 端口和输出，脚本里用 `.value` |
| `config` | 同类型节点的只读配置 |
| `nodeEvent` | 事件：`input:<id>`、`output:<id>`、`save`、`copy`、`delete`、`canConnect` |
| `files` | 工作区文件：`uploadFile`、`useFileUrl`、`getWorkspaceFiles` |
| `ai` | 调用已配置的模型：`getModels`、`generate`、`generateImage`、`generateVideo` |
| `ffmpeg` | 音视频处理 |

## 让小麦同学能操作节点

```ts
import { nodeSkeleton, nodeTools, useNode, z, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";

const { nodeProps, outputs } = useNode(/* 同上 */);

nodeTools.register({
  name: "setText",
  description: "修改便签的文本内容",
  parameters: z.strictObject({ text: z.string().max(10000) }),
  execute({ text }, { signal }) {
    signal?.throwIfAborted();
    outputs.value.text.value = text;
    return { text };
  },
});
```

启用画布操作工具后，小麦同学就能调用 `node:setText` 修改这个节点。

## 保存图片等文件

```ts
const { outputs, files } = useNode();
const imageUrl = files.useFileUrl(() => outputs.value.image?.value as
  { url: string; mimeType: string } | undefined, error => console.error(error));

async function uploadImage(file: File) {
  if (!file.type.startsWith("image/") || !file.size || file.size > 20 * 1024 * 1024) {
    throw new Error("请选择 20 MiB 以内的非空图片");
  }
  const path = await files.uploadFile(file);
  outputs.value.image = { dataType: "IMAGE", value: { url: path, mimeType: file.type } };
}
```

`imageUrl` 绑到 `<img :src>` 显示。不要把 `blob:` 地址存进输出，重新打开会丢。

## 常见问题

- **菜单里没有节点**：检查是否已安装并启用。
- **还是旧代码**：确认 dev 已同步，再点节点标题栏刷新。
- **连线没有输出**：核对端口 id、outputs 键和数据类型，处理 `undefined`。
- **重开后图片丢了**：检查是否存了 Blob 地址而不是工作区相对路径。

参考仓库里 `packages/nodes/` 下的内置节点，例如 `textNode`、`imageNode`。

## 复制给 AI 的规则（节点插件）

```text
请为「麦麦工坊」画布写一个节点插件，要求：
1. 放在源码仓库 packages/nodes/<节点名>/，节点名小驼峰（例如 noteNode）；包含 package.json、tsconfig.json、vite.config.ts、readme.md、src/index.vue。
2. package.json：name "@toonflow/node-<短横线名>"，version "1.0.0"，private，type "module"；scripts { build: "vite build", dev: "vite build --watch", typecheck: "vue-tsc --noEmit" }；peerDependencies vue ^3.5.42、@vue-flow/core ^1.48.2、element-plus ^2.14.5；devDependencies "@toonflow/nodes-scaffold": "workspace:*"、typescript ~6.0.3、vite ^8.2.2、vue-tsc ^3.3.11。
3. tsconfig.json 继承 "../../../tsconfig.base.json"，lib ["ESNext","DOM","DOM.Iterable"]，types ["vite/client"]，include ["src","vite.config.ts"]。
4. vite.config.ts：export default createNodeConfig({ name, displayName, author, github: "", configRules? }, import.meta.url)，从 "@toonflow/nodes-scaffold" 导入。
5. src/index.vue 顺序 <template> → <script setup lang="ts"> → <style scoped>；运行时代码只从 "@toonflow/nodes-scaffold/runtime" 导入（nodeSkeleton、useNode、z、类型 NodeHandle 等）。
6. 模板根元素是 <nodeSkeleton v-bind="nodeProps">；defineOptions({ inheritAttrs: false, handles: [...] satisfies NodeHandle[] })，端口格式 { id, type: "source"|"target", dataType, label }。
7. useNode({ label, outputs }) 在 setup 中调用；outputs 的键与 source 端口 id 一致；类型只用 STRING/INT/FLOAT/BOOLEAN/IMAGE/MASK/VIDEO/AUDIO，媒体 value 为 { url: 工作区相对路径, mimeType }。
8. 输入用 nodeEvent.on("input:<id>", values => ...) 订阅，values 是数组，需处理 undefined。
9. 节点里可交互的元素加 class "nodrag nopan nowheel"，并加 @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop。
10. 给小麦同学暴露节点操作：从 runtime 导入 nodeTools，在 setup 中 nodeTools.register({ name: 小驼峰, description, parameters: z.strictObject({...}), execute(args, { signal }) })，先 signal?.throwIfAborted()，返回可 JSON 序列化的结果。
11. 文件用 files.uploadFile 保存并存相对路径，不存 blob: 地址；调用模型用 useNode 返回的 ai，不自己发请求、不写死 Key。
12. 自有类名小驼峰；Element Plus 组件显式导入（例如 import { ElInput } from "element-plus"），模板写 <el-input />，属性名小驼峰；样式用 scoped，不写全局 reset。
请输出所有文件完整内容，并给出构建命令：bun run --filter '@toonflow/node-<短横线名>' build
```
