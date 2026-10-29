import { createHash, randomBytes } from "node:crypto";
import conf from "@/utils/conf";
import { t } from "@/lib/i18n";
import type { CloudUser } from "@/types/desktop";

export type CloudSession = { user: CloudUser; accessToken: string; refreshToken: string; expiresAt: number };
type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };

// ACT: 正式域名确定前默认连接本机开发服务；部署后改为正式地址，或用 MAIMAI_CLOUD_URL 覆盖。
export const cloudUrl = (process.env.MAIMAI_CLOUD_URL || "http://127.0.0.1:8100").replace(/\/+$/, "");
// ACT: 只保留最近一次登录请求，进程重启或重复点击登录后旧回调作废。
let pendingLogin: { state: string; verifier: string; expiresAt: number } | undefined;
let refreshing: Promise<CloudSession | undefined> | undefined;

async function request<T>(path: string, options: { body?: unknown; token?: string } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${cloudUrl}/api/auth/${path}`, {
      method: options.body === undefined ? "GET" : "POST",
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

export function startLogin() {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  pendingLogin = { state, verifier, expiresAt: Date.now() + 10 * 60_000 };
  const url = new URL("/login", cloudUrl);
  url.search = new URLSearchParams({ client: "desktop", state, codeChallenge: createHash("sha256").update(verifier).digest("base64url") }).toString();
  return url.href;
}

export async function finishLogin(code: string, state: string) {
  const pending = pendingLogin;
  if (!pending || pending.state !== state || pending.expiresAt < Date.now()) {
    throw Object.assign(new Error("登录请求已失效，请在麦麦工坊中重新点击登录"), { status: 400 });
  }
  pendingLogin = undefined;
  const result = await request<Tokens & { user: CloudUser }>("token", { body: { code, codeVerifier: pending.verifier } });
  conf.set("cloudSession", { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: Date.now() + result.expiresIn * 1000 });
  return result.user;
}

export async function getAccount() {
  const session = await currentSession();
  if (!session) return null;
  try {
    const user = await request<CloudUser>("me", { token: session.accessToken });
    replaceSession(session, { ...session, user });
    return user;
  } catch (error) {
    if ((error as { status?: number }).status !== 401) throw error;
    replaceSession(session);
    return null;
  }
}

export async function logout() {
  const session = conf.get("cloudSession");
  pendingLogin = undefined;
  conf.delete("cloudSession");
  // ACT: 本地先退出；云端不可达时只记录错误，云端会话最长 30 天后自然过期。
  if (session) await request("logout", { body: { refreshToken: session.refreshToken } }).catch(error => console.error("麦麦云退出失败：", error));
}
