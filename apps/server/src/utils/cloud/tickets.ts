import { cloudUrl, sessionFetch } from "@/utils/cloud";
import { t } from "@/lib/i18n";

// 工单接口走站内 /api/tickets，响应 { code, data, message }，与网关 /v1 的错误体不同。
async function ticketRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await sessionFetch(`${cloudUrl}/api/tickets${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if ((error as { status?: number }).status) throw error;
    throw Object.assign(new Error("无法连接麦麦云，请检查网络后重试"), { status: 502 });
  }
  const result = await response.json().catch(() => null) as { data?: T; message?: string } | null;
  if (!response.ok) throw Object.assign(new Error(result?.message || t`麦麦云请求失败（HTTP ${response.status}）`), { status: response.status >= 500 ? 502 : response.status });
  return result?.data as T;
}

export function listTickets(query: { page: number; size: number; status?: string }) {
  const search = new URLSearchParams({ page: String(query.page), size: String(query.size), ...(query.status ? { status: query.status } : {}) });
  return ticketRequest(`?${search}`);
}

export function createTicket(body: { category: string; title: string; content: string; clientInfo: string }) {
  return ticketRequest("", { body });
}

export function getTicket(id: number) {
  return ticketRequest(`/${id}`);
}

export function replyTicket(id: number, content: string) {
  return ticketRequest(`/${id}/messages`, { body: { content } });
}

export function closeTicket(id: number) {
  return ticketRequest(`/${id}/close`, { body: {} });
}
