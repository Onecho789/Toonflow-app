# 文件扩展开发

文件扩展决定工作区「文档」面板怎么打开某类文件：文本编辑器、图片查看器、Markdown 预览等都是文件扩展。每个扩展是 `packages/ext/` 下的一个包，只使用宿主传进来的 `context`。

## 用脚手架创建

在源码仓库根目录运行：

```bash
bun packages/extScaffold/create.ts myEditor
bun install
```

参数是小驼峰名称，不带 `ext-`。它会生成 ID 为 `ext-myEditor` 的扩展：

```text
packages/ext/myEditor/
  package.json
  tsconfig.json
  viteConfig.ts
  readme.md
  src/
    metadata.ts    # 显示名、图标、文件后缀、配置
    index.ts       # 组合声明和组件
    index.vue      # 编辑器界面
```

生成的模板已经能编辑文本。通常只需要改 `metadata.ts` 和 `index.vue`。

## 扩展声明 metadata.ts

```ts
import type { ExtDefinition } from "@toonflow/ext-scaffold/runtime";

export default {
  id: "ext-myEditor",
  displayName: "我的编辑器",
  extensions: ["txt"],
  resourceKind: "file",
  text: true,
  configRules: [{ type: "inputNumber", field: "fontSize", title: "字号", value: 14, props: { min: 10, max: 32 } }],
} satisfies Omit<ExtDefinition, "load">;
```

| 字段 | 说明 |
| --- | --- |
| `id` | `ext-` 加小驼峰名称，所有扩展里唯一 |
| `displayName` | 显示名称 |
| `extensions` | 能打开的后缀，不带点，小写字母或数字 |
| `resourceKind` | `file`（文件）或 `canvasNode`（画布节点展示） |
| `text` | 文本编辑器写 `true`，宿主才会预载文本并允许保存；图片等二进制预览不写 |
| `icon?` | 图片 URL 或 `data:image` 内嵌图标 |
| `configRules?` | form-create JSON 规则，最多 100 项；不写就没有设置入口 |

同一后缀有多个扩展时，用户第一次打开会选择，也可以在「插件市场 › 默认打开方式」里改。

`src/index.ts` 一般不用改：

```ts
import { defineExt } from "@toonflow/ext-scaffold/runtime";
import metadata from "./metadata";

export default defineExt({ ...metadata, load: () => import("./index.vue") });
```

## 组件拿到的 context

```ts
import type { ExtContext } from "@toonflow/ext-scaffold/runtime";

const props = defineProps<{ context: ExtContext }>();
```

| 成员 | 用途 |
| --- | --- |
| `resource` | 当前文件：工作区目录、相对路径、标签名 |
| `text` / `loading` / `error` / `dirty` | 宿主管理的正文和状态，只读 |
| `updateText(text)` | 提交编辑，由宿主负责保存 |
| `flushSave()` | 等待保存完成 |
| `files` | 工作区文件：`read`、`readText`、`write`、`list`、`acquireUrl` 等 |
| `active` | 当前标签是否激活，媒体可据此暂停 |
| `config` / `saveConfig(config)` | 扩展配置的读取与保存 |
| `openFile(path)` | 打开同一工作区的另一个文件 |
| `writeClipboardText(text)` | 复制文本 |

编辑文本一定用 `context.updateText()`，不要用 `files.write()` 自己写文件：宿主会处理编码、保存队列和“文件被外部修改”的冲突保护。同一个文件可以分屏打开多份，组件要监听 `context.text` 接收另一侧的修改。

显示图片等二进制文件用 `context.files.acquireUrl(path)`，得到 `{ url: Promise<string>, release() }`，切换文件或卸载时调用 `release()`。

## 构建与安装

```bash
bun run --cwd packages/ext/myEditor build
```

产物是 `build/ext/ext-myEditor.umd.js`，「插件市场 › 安装插件」上传即可。边改边看用 `bun run --cwd packages/ext/myEditor dev`，会同步到开发版客户端的数据目录。

Vue 和 Element Plus 由宿主提供，不会重复打包。需要 Markdown 编辑能力时，Tiptap、marked、DOMPurify 也可复用宿主的版本，参考仓库里 `packages/ext/md`。内置的 `txt`、`image`、`media`、`md`、`canvasNode` 都可以当参考。

## 复制给 AI 的规则（文件扩展）

```text
请为「麦麦工坊」写一个文件扩展（文档面板的文件编辑器/预览器），要求：
1. 我会先在源码仓库运行 bun packages/extScaffold/create.ts <名称> 生成 packages/ext/<名称>/，你只需修改 src/metadata.ts 和 src/index.vue（必要时 readme.md 和 package.json 的 version）。
2. metadata.ts：默认导出 { id: "ext-<名称>", displayName, extensions: [不带点的小写后缀], resourceKind: "file", text?: true, icon?, configRules? } satisfies Omit<ExtDefinition, "load">，类型从 "@toonflow/ext-scaffold/runtime" 导入。configRules 是 form-create JSON 规则，不含函数。
3. index.vue 顺序 <template> → <script setup lang="ts"> → <style scoped>；props 只有 defineProps<{ context: ExtContext }>()。
4. 文本类：显示 context.text，编辑时调用 context.updateText(text)，不要用 context.files.write 保存当前文件；context.loading 时禁用编辑；监听 context.text 变化同步内容。
5. 二进制预览：用 context.files.acquireUrl(path) 取 url，切换资源或卸载时必须调用 release()。
6. 配置用 context.config 读取并做类型兜底，修改配置用 await context.saveConfig(...)，错误要在界面显示。
7. 不导入 apps/web/src 里的任何代码；Element Plus 组件显式导入（import { ElButton } from "element-plus"），模板写 <el-button />，属性名小驼峰；自有类名小驼峰；控件要有 aria-label。
请输出修改后的完整文件，并给出构建命令：bun run --cwd packages/ext/<名称> build
```
