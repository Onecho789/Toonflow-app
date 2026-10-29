import conf from "@/utils/conf";
import { t } from "@/lib/i18n";
import type { CloudUser } from "@/types/desktop";

export type CloudSession = { user: CloudUser; accessToken: string; refreshToken: string; expiresAt: number; apiKey?: { id: number; key: string } };
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

function currentSession() {
  const session = conf.get("cloudSession");
  if (!session || session.expiresAt > Date.now() + 60_000) return Promise.resolve(session);
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

async function saveSession(result: Tokens & { user: CloudUser }) {
  const session: CloudSession = { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: Date.now() + result.expiresIn * 1000 };
  conf.set("cloudSession", session);
  // 必须改密码的账号暂时不能建 Key，改密后首次调用模型时再补建。
  if (!result.user.mustChangePassword) await createApiKey(session).catch(error => console.error("麦麦云客户端 Key 创建失败：", error));
  return result.user;
}

async function createApiKey(session: CloudSession) {
  const created = await request<{ id: number; key: string }>("keys/", { body: { name: "麦麦工坊客户端" }, token: session.accessToken });
  const next = { ...session, apiKey: { id: created.id, key: created.key } };
  replaceSession(session, next);
  return next;
}

// 网关只认 mm- Key；访问令牌 15 分钟过期，所以登录后为本机建一把专用 Key，旧会话首次调用时补建。
export async function getApiKey() {
  const session = await currentSession();
  if (!session) throw Object.assign(new Error("请先登录麦麦云账号"), { status: 401 });
  if (session.apiKey) return session.apiKey.key;
  if (session.user.mustChangePassword) throw Object.assign(new Error("请先在账号设置中修改初始密码"), { status: 403 });
  return (await createApiKey(session)).apiKey!.key;
}

// Key 被删或账号停用时网关返回 401，丢弃本地 Key，下次调用重新创建。
export function dropApiKey(key: string) {
  const session = conf.get("cloudSession");
  if (session?.apiKey?.key !== key) return;
  const { apiKey: _apiKey, ...rest } = session;
  conf.set("cloudSession", rest);
}

export async function login(email: string, password: string) {
  return await saveSession(await request<Tokens & { user: CloudUser }>("login", { body: { email, password } }));
}

export async function register(email: string, code: string, password: string) {
  return await saveSession(await request<Tokens & { user: CloudUser }>("register", { body: { email, code, password } }));
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
  // ACT: 本地先退出；云端不可达时只记录错误，云端会话最长 30 天后自然过期，未删掉的客户端 Key 留在账号 Key 列表里由用户删除。
  try {
    let { accessToken, refreshToken } = session;
    if (session.apiKey && session.expiresAt <= Date.now() + 60_000) ({ accessToken, refreshToken } = await request<Tokens>("refresh", { body: { refreshToken } }));
    if (session.apiKey) await request(`keys/${session.apiKey.id}`, { method: "DELETE", token: accessToken }).catch(error => console.error("麦麦云客户端 Key 删除失败：", error));
    await request("logout", { body: { refreshToken } });
  } catch (error) { console.error("麦麦云退出失败：", error); }
}
