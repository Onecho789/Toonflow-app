import type { CloudPlugin } from "@/types/desktop";
import { gatewayError, gatewayFetch, gatewayUrl } from "@/utils/cloud/models";

export async function listCloudPlugins(query: { page: number; size: number; type: string; keyword?: string }) {
  const search = new URLSearchParams({ page: String(query.page), size: String(query.size), type: query.type, ...(query.keyword ? { keyword: query.keyword } : {}) });
  const response = await gatewayFetch(`/plugins?${search}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw await gatewayError(response);
  const { data, total } = await response.json() as { data: Omit<CloudPlugin, "url">[]; total: number };
  return { total, list: data.map((item): CloudPlugin => ({ ...item, url: `${gatewayUrl}/plugins/${item.id}/file` })) };
}

export async function togglePluginCollection(id: number) {
  const response = await gatewayFetch(`/plugins/${id}/collection`, { method: "POST", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw await gatewayError(response);
  return await response.json() as { collected: boolean };
}
