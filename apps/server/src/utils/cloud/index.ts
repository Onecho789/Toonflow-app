import conf from "@/utils/conf";
import { t } from "@/lib/i18n";
import type { CloudUser } from "@/types/desktop";

// ACT: 旧版本地会话里残留的 apiKey 字段不再读取，也不迁移；Go 版云端不再使用客户端 Key。
export type CloudSession = { user: CloudUser; accessToken: string; refreshToken: string; expiresAt: number };
type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };

// ACT: 正式域名确定前默认连接测试服务器（IP 证书）；本机联调用 MAIMAI_CLOUD_URL 覆盖。
export const cloudUrl = (process.env.MAIMAI_CLOUD_URL || "https://159.75.178.145:8100").replace(/\/+$/, "");
let refreshing: Promise<CloudSession | undefined> | undefined;

async function request<T>(path: string, options: { body?: unknown; token?: string; method?: string } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${cloudUrl}/api/${path.includes("/") ? path : `auth/${path}`}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(new Error("无法连接麦麦云，请检查网络后重试"), { status: 502 });
  }
  const result = await response.json().catch(() => null) as { data?: T; message?: string } | null;
  if (!response.ok) throw Object.assign(new Error(result?.message || t`麦麦云请求失败（HTTP ${response.status}）`), { status: response.status >= 500 ? 502 : response.status });
  return result?.data as T;
}

// 网络请求期间可能已退出或重新登录，仅在本地会话未变时写入，避免恢复已退出的账号。
function replaceSession(previous: CloudSession, next?: CloudSession) {
  if (conf.get("cloudSession")?.refreshToken !== previous.refreshToken) return;
  if (next) conf.set("cloudSession", next);
  else conf.delete("cloudSession");
}

// staleToken 为刚被拒绝的访问令牌：本地仍是它时强制刷新，已被其他请求刷新过则直接用新令牌。
function currentSession(staleToken?: string) {
  const session = conf.get("cloudSession");
  if (!session || (session.expiresAt > Date.now() + 60_000 && session.accessToken !== staleToken)) return Promise.resolve(session);
  // 刷新令牌每次使用都会轮换，并发刷新会被云端判定为重放，这里合并为一次。
  refreshing ??= request<Tokens>("refresh", { body: { refreshToken: session.refreshToken } })
    .then(tokens => {
      const next = { ...session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: Date.now() + tokens.expiresIn * 1000 };
      replaceSession(session, next);
      return next;
    }, error => {
      if (error.status !== 401) throw error;
      replaceSession(session);
      return undefined;
    })
    .finally(() => refreshing = undefined);
  return refreshing;
}

function saveSession(result: Tokens & { user: CloudUser }) {
  conf.set("cloudSession", { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: Date.now() + result.expiresIn * 1000 });
  return result.user;
}

// 带登录会话的访问令牌请求麦麦云；401 时强制刷新会话后重试一次，仍 401 视为未登录并清除本地会话。
// 只给发往麦麦云的请求加令牌，其他地址原样转发，避免令牌泄露给第三方。
// ACT: 重试会重发 init.body，调用方只传字符串、FormData 等可重复读取的 body；传 ReadableStream 时重试会失败，需要时再改为先缓存。
export const sessionFetch = Object.assign(async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
  const source = typeof input === "object" && "url" in input ? input : undefined;
  const url = source?.url ?? String(input);
  if (url !== cloudUrl && !url.startsWith(`${cloudUrl}/`)) return fetch(input, init);
  let token: string | undefined;
  for (let attempt = 0; ; attempt++) {
    const session = await currentSession(token);
    if (!session) throw Object.assign(new Error("请先登录麦麦云账号"), { status: 401 });
    token = session.accessToken;
    const headers = new Headers(init.headers ?? source?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    // Request 的请求体只能读取一次，每次发送前复制。
    const response = await fetch((source?.clone() ?? input) as typeof input, { ...init, headers });
    if (response.status !== 401) return response;
    if (attempt) {
      replaceSession(session);
      return response;
    }
    await response.body?.cancel();
  }
}, fetch);

// SDK 初始化需要一个非空 Key；实际发送时由 sessionFetch 换成最新令牌。
export async function getAccessToken() {
  const session = await currentSession();
  if (!session) throw Object.assign(new Error("请先登录麦麦云账号"), { status: 401 });
  return session.accessToken;
}

export async function login(email: string, password: string) {
  return saveSession(await request<Tokens & { user: CloudUser }>("login", { body: { email, password } }));
}

export async function register(email: string, code: string, password: string) {
  return saveSession(await request<Tokens & { user: CloudUser }>("register", { body: { email, code, password } }));
}

export async function sendCode(email: string) {
  await request("code", { body: { email } });
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const session = await currentSession();
  if (!session) throw Object.assign(new Error("请先登录麦麦云"), { status: 401 });
  await request("password", { body: { oldPassword, newPassword }, token: session.accessToken });
  const user = { ...session.user, mustChangePassword: false };
  replaceSession(session, { ...session, user });
  return user;
}

export async function getAccount() {
  const stored = conf.get("cloudSession");
  if (!stored) return null;
  let session = stored;
  try {
    const current = await currentSession();
    if (!current) return null;
    session = current;
    const user = await request<CloudUser>("me", { token: session.accessToken });
    replaceSession(session, { ...session, user });
    return user;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) {
      replaceSession(session);
      return null;
    }
    // ACT: 云端不可达（网络错误或 5xx）时沿用本地保存的账号离线进入；需要云端的功能各自报错。
    if (status === 502) return stored.user;
    throw error;
  }
}

export async function logout() {
  const session = conf.get("cloudSession");
  conf.delete("cloudSession");
  if (!session) return;
  // ACT: 本地先退出；云端不可达时只记录错误，云端会话最长 30 天后自然过期。
  await request("logout", { body: { refreshToken: session.refreshToken } }).catch(error => console.error("麦麦云退出失败：", error));
}
