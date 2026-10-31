export type CloudPromptItem = {
  id: string;
  title: string;
  prompt: string;
  description?: string;
  coverUrl?: string;
  referenceImageUrls?: string[];
  tags?: string[];
  author?: string;
  sourceUrl?: string;
};
export type CloudPromptSource = { id: number; name: string; type: "image" | "video"; homepage: string; items: CloudPromptItem[] };

// ACT: 各节点 UMD 有独立模块作用域，挂到全局共用一次请求；服务端已缓存 10 分钟，这里只在页面生命周期内复用，失败不缓存。
const cacheKey = Symbol.for("toonflow.cloudPrompts");
const cacheHost = globalThis as typeof globalThis & { [cacheKey]?: Promise<CloudPromptSource[]> };

export function readCloudPrompts(refresh = false): Promise<CloudPromptSource[]> {
  if (!refresh && cacheHost[cacheKey]) return cacheHost[cacheKey];
  const request = fetch("/api/cloud/prompts", { cache: "no-store" }).then(async response => {
    const result = await response.json().catch(() => ({})) as { code?: number; data?: CloudPromptSource[]; message?: string };
    if (!response.ok || result.code !== 200) throw new Error(result.message || `提示词库读取失败（HTTP ${response.status}）`);
    return result.data ?? [];
  });
  cacheHost[cacheKey] = request;
  request.catch(() => { if (cacheHost[cacheKey] === request) delete cacheHost[cacheKey]; });
  return request;
}

// 与节点 setPrompt 工具一致：纯文本按行转成输入框模型
export function promptModelOf(text: string) {
  return text.split("\n").map(line => [{ type: "Write" as const, text: line }]);
}
