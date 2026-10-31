import { z } from "zod";
import type { ToolPlugin } from "@toonflow/tools-scaffold/runtime";

const optionsSchema = z.array(z.string().trim().min(1).max(300)).max(20)
  .refine(options => new Set(options).size === options.length, "选项不能重复");

const fieldSchema = z.object({
  field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/)
    .refine(field => !["constructor", "prototype", "__proto__"].includes(field), "字段名不可用")
    .describe("唯一的小驼峰字段名，例如 duckRef；仅英文字母和数字，不能包含下划线或短横线"),
  title: z.string().trim().min(1).max(200),
  type: z.enum(["input", "textarea", "radio", "checkbox", "select", "inputNumber", "switch"]),
  required: z.boolean().optional(),
  options: optionsSchema.optional().describe("radio、checkbox、select 类型必须提供非空选项"),
  placeholder: z.string().trim().max(300).optional(),
}).refine(field => !["radio", "checkbox", "select"].includes(field.type) || !!field.options?.length,
  "选择类字段必须提供选项");

const questionSchema = z.object({
  title: z.string().trim().min(1).max(100).describe("提问卡片标题，简要概括本次需要确认的内容"),
  question: z.string().trim().min(1).max(4000).describe("必填：问题或整组问题的说明；使用 fields 时也必须提供"),
  options: optionsSchema.max(8).optional()
    .describe("单个选择题的选项，与 fields 二选一；使用 fields 时省略此项，没有选项时省略，不要传空数组"),
  fields: z.array(fieldSchema).max(12)
    .refine(fields => new Set(fields.map(field => field.field)).size === fields.length, "字段名不能重复").optional()
    .describe("多个问题，每项一个问题，与顶层 options 二选一；只问一个问题时省略此项，不要传空数组"),
}).refine(request => !request.fields?.length || !request.options?.length, "动态表单不能同时提供顶层选项");

// 模型常把可选数组填成空数组：空 options/fields 视为未提供，有问题列表时以 fields 为准。
function normalizeRequest(params: unknown) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return params;
  const request: Record<string, unknown> = { ...params };
  for (const key of ["options", "fields"]) {
    if (Array.isArray(request[key]) && !request[key].length) delete request[key];
  }
  if (Array.isArray(request.fields)) delete request.options;
  return request;
}

function parseRequest(params: unknown) {
  const result = questionSchema.safeParse(normalizeRequest(params));
  if (result.success) return result.data;
  const issues = result.error.issues.map(issue => `- ${issue.path.join(".") || "参数"}：${issue.message}`);
  throw new Error(`提问参数有误，表单未生成：\n${issues.join("\n")}\n请按上述字段修正后重新调用 askUser：单个选择题只传 options，多个问题只传 fields，不需要的字段直接省略。`);
}

const plugin: ToolPlugin = {
  validateConfig(config) {
    if (Object.keys(config).length) throw new Error("提问器工具没有配置项");
    return {};
  },
  createTools({ question }) {
    if (!question) return [];
    return [{
      name: "askUser",
      label: "提问器",
      description: "需要用户补充信息或作出选择时调用。单个选择题使用 options，多个问题使用 fields。结果包含 answer，多问题还包含 values；用户跳过整组提问时返回 skipped: true。",
      promptSnippet: "一次询问一个或多个问题；用户可以回答或跳过，跳过不代表阶段确认通过。",
      parameters: z.toJSONSchema(questionSchema, { io: "input", target: "draft-07" }),
      executionMode: "sequential",
      async execute(id, params, signal) {
        const result = await question.ask(id, parseRequest(params), signal);
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
      },
    }];
  },
};

export default plugin;
