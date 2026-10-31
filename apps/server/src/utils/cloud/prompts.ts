import conf from "@/utils/conf";
import { gatewayError, gatewayFetch } from "@/utils/cloud/models";

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

// ACT: 提示词库对所有用户相同，进程内缓存 10 分钟；后台改动最迟 10 分钟后生效，失败不缓存。
let cache: { expires: number; value: Promise<CloudPromptSource[]> } | undefined;

export function listCloudPrompts(): Promise<CloudPromptSource[]> {
  if (!conf.get("cloudSession")) return Promise.resolve([]);
  if (cache && cache.expires > Date.now()) return cache.value;
  const entry = {
    expires: Date.now() + 10 * 60_000,
    value: (async () => {
      const response = await gatewayFetch("/prompts", { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw await gatewayError(response);
      return (await response.json() as { data: CloudPromptSource[] }).data;
    })(),
  };
  cache = entry;
  void entry.value.catch(() => { if (cache === entry) cache = undefined; });
  return entry.value;
}
