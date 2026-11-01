# 技能开发

技能是一份写给小麦同学的 Markdown 操作手册：做什么、按什么步骤、输出成什么样。它不用编译，也不会增加新的程序能力，只能指挥本轮已启用的工具和节点。

## 目录结构

```text
storyReview/
  SKILL.md                  # 主文件，文件名大小写不能改
  references/
    reviewChecklist.md      # 可选：参考资料，按需读取
```

`references/`、`templates/` 只是整理习惯，不会自动加载，要在正文里用链接指出何时去读。

## 放在哪里生效

| 位置 | 作用范围 |
| --- | --- |
| 项目目录下 `skill/storyReview/SKILL.md` | 只在这个项目生效（目录名是单数 skill） |
| 插件市场安装（全局） | 所有项目都能用 |

两边同名时项目内优先。调试时建议先放在项目的 `skill/` 下，改完直接发新消息就能验证，不用反复安装。

## SKILL.md 字段

文件用 UTF-8 编码，开头用 `---` 包住一段 YAML，后面是正文。

| 字段 | 要求 |
| --- | --- |
| `name` | 必填，唯一标识，小写字母开头的小驼峰，最长 64 字符，建议和文件夹同名 |
| `description` | 必填，1–1024 字符。写清楚做什么、什么时候用，小麦同学靠它决定要不要用 |
| `disable-model-invocation` | 可选。`true` 表示只有用户点名时才用，不会自动匹配 |
| `metadata.displayName` | 插件市场显示的名字 |
| `metadata.version` | 版本号，例如 `"1.0.0"`，更新时调高 |
| `metadata.author` | 作者名 |

## 最小示例

`storyReview/SKILL.md`：

```markdown
---
name: storyReview
description: 检查短篇剧本中的人物动机、因果关系和情节连续性。用户要求审阅剧本、查找剧情漏洞或提出修改意见时使用。
metadata:
  version: "1.0.0"
  displayName: 剧本审阅
  author: 你的名字
---

# 剧本审阅

只审阅用户本次提供或指定的剧本，不擅自改写原文。

1. 确认审阅范围；未提供剧本时，请用户补充正文或文件位置。
2. 阅读完整目标内容，再读取 [审阅检查项](references/reviewChecklist.md)。
3. 按检查项识别问题，为每个问题引用原文中的具体情节。
4. 按“位置、问题、依据、建议”输出结果，建议与原文事实分开。
5. 未发现明确问题时直接说明，不为了凑数制造剧情缺陷。
```

`storyReview/references/reviewChecklist.md`：

```markdown
# 审阅检查项

- 人物是否有足以支持当前行动的动机？
- 关键事件之间是否存在明确因果关系？
- 同一人物、物品和事件的状态是否前后一致？
- 信息不足时标记“待确认”，不要当作已证实的错误。
```

## 怎么用

- **点名使用**：对话框开头输入 `/skill:storyReview 请审阅下面这段剧本……`，或输入 `/` 从技能菜单里选。
- **自动使用**：没设 `disable-model-invocation: true` 时，小麦同学会根据 description 自己判断要不要用。

修改技能后，等当前回复结束，再发一条新消息验证。

## 打包与安装

没有附属资料时，直接上传单个 `SKILL.md` 即可。有资料就打成 ZIP，在 storyReview 的上一级目录用 PowerShell 运行：

```powershell
Compress-Archive -LiteralPath .\storyReview -DestinationPath .\storyReview.zip -Force
```

然后「插件市场 › 安装插件」选择 zip。限制：

- 包大小和解压总量都不超过 20 MB，最多 2000 个文件和目录
- 包里恰好一个 `SKILL.md`，不要夹带其他技能或整个项目
- ZIP 不能加密、不能分卷；TAR 用普通格式
- 更新会替换整个技能目录，新版没带的旧资料会被删掉

## 复制给 AI 的规则（技能）

```text
请为「麦麦工坊」写一个技能（Agent Skill），要求：
1. 输出一个文件夹，名称为小驼峰（例如 storyReview），里面是 SKILL.md，可选 references/ 下放参考资料，资料文件名也用小驼峰。
2. SKILL.md 使用 UTF-8，开头是 YAML frontmatter：
   - name：与文件夹同名，小写字母开头的小驼峰，≤64 字符
   - description：1–1024 字符，写清楚“做什么”和“用户说什么时使用”
   - metadata.version："1.0.0"；metadata.displayName：中文显示名；metadata.author：作者
   - 只有需要用户点名才启用时，加 disable-model-invocation: true（保留这个短横线写法）
3. 正文用编号步骤写清楚：先确认输入、再执行、最后按固定格式输出；写明不该做什么（例如不擅自改写原文、不编造）。
4. 参考资料用相对链接引用，例如 [检查项](references/checklist.md)，并说明在哪一步读取。
5. 技能不能增加新能力，只能使用已有工具；不要写“运行某脚本”这类需要额外程序的步骤。
6. 不写 allowed-tools、model 等无效字段。
请输出每个文件的完整内容。
```
