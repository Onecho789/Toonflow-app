import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import conf from "@/utils/conf";
import { t } from "@/lib/i18n";
import type { CloudUser } from "@/types/desktop";
import { protect, unprotect } from "@/utils/cloud/protect";

// 设备 Key 由云端在登录时签发，一台设备一个，Windows 下 DPAPI 加密保存；吊销、改密或 90 天未用后失效，需重新登录。
// ACT: 旧版本地会话（访问令牌、刷新令牌）没有 apiKey，视为未登录，不迁移。
export type CloudSession = { user: CloudUser; apiKey: string };

// ACT: 正式域名确定前默认连接测试服务器（IP 证书）；本机联调用 MAIMAI_CLOUD_URL 覆盖。
export const cloudUrl = (process.env.MAIMAI_CLOUD_URL || "https://159.75.178.145:8100").replace(/\/+$/, "");

async function request<T>(path: string, options: { body?: unknown; key?: string; method?: string } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${cloudUrl}/api/${path.includes("/") ? path : `auth/${path}`}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", ...(options.key ? { Authorization: `Bearer ${options.key}` } : {}) },
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

// 设备标识跨登录保留，云端据此在同一设备重复登录时替换旧 Key，而不是越积越多。
function device() {
  let deviceId = conf.get("cloudDeviceId");
  if (!deviceId) conf.set("cloudDeviceId", deviceId = randomUUID());
  return { deviceId, deviceName: hostname().slice(0, 64) };
}

// 返回本地会话与解密后的 Key；DPAPI 解密失败（换了系统账号或电脑）按未登录处理。
function currentSession() {
  const session = conf.get("cloudSession");
  if (!session?.apiKey) return undefined;
  try {
    return { session, key: unprotect(session.apiKey) };
  } catch (error) {
    console.error("麦麦云凭据无法解密，需重新登录：", error);
    conf.delete("cloudSession");
    return undefined;
  }
}

// 请求期间可能已退出或重新登录，仅在本地会话未变时修改，避免恢复已退出的账号。
function replaceSession(previous: CloudSession, next?: CloudSession) {
  if (conf.get("cloudSession")?.apiKey !== previous.apiKey) return;
  if (next) conf.set("cloudSession", next);
  else conf.delete("cloudSession");
}

function saveSession(result: { user: CloudUser; apiKey: string }) {
  conf.set("cloudSession", { user: result.user, apiKey: protect(result.apiKey) });
  return result.user;
}

// 给发往麦麦云的请求带上设备 Key，其他地址原样转发，避免 Key 泄露给第三方；401 说明 Key 已失效，清除本地会话回到登录页。
export const sessionFetch = Object.assign(async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
  const source = typeof input === "object" && "url" in input ? input : undefined;
  const url = source?.url ?? String(input);
  if (url !== cloudUrl && !url.startsWith(`${cloudUrl}/`)) return fetch(input, init);
  const current = currentSession();
  if (!current) throw Object.assign(new Error("请先登录麦麦云账号"), { status: 401 });
  const headers = new Headers(init.headers ?? source?.headers);
  headers.set("Authorization", `Bearer ${current.key}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) replaceSession(current.session);
  return response;
}, fetch);

// SDK 初始化需要 Key；实际发送时由 sessionFetch 设置请求头。
export function getApiKey() {
  const current = currentSession();
  if (!current) throw Object.assign(new Error("请先登录麦麦云账号"), { status: 401 });
  return current.key;
}

export async function login(email: string, password: string) {
  return saveSession(await request<{ user: CloudUser; apiKey: string }>("login", { body: { email, password, ...device() } }));
}

export async function register(email: string, code: string, password: string) {
  return saveSession(await request<{ user: CloudUser; apiKey: string }>("register", { body: { email, code, password, ...device() } }));
}

export async function sendCode(email: string) {
  await request("code", { body: { email } });
}

// 改密后云端吊销其他设备的 Key，本机 Key 保留。
export async function changePassword(oldPassword: string, newPassword: string) {
  const current = currentSession();
  if (!current) throw Object.assign(new Error("请先登录麦麦云"), { status: 401 });
  try {
    await request("password", { body: { oldPassword, newPassword }, key: current.key });
  } catch (error) {
    if ((error as { status?: number }).status === 401) replaceSession(current.session);
    throw error;
  }
  const user = { ...current.session.user, mustChangePassword: false };
  replaceSession(current.session, { ...current.session, user });
  return user;
}

export async function getAccount() {
  const current = currentSession();
  if (!current) return null;
  try {
    const user = await request<CloudUser>("me", { key: current.key });
    replaceSession(current.session, { ...current.session, user });
    return user;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) {
      replaceSession(current.session);
      return null;
    }
    // ACT: 云端不可达（网络错误或 5xx）时沿用本地保存的账号离线进入；需要云端的功能各自报错。
    if (status === 502) return current.session.user;
    throw error;
  }
}

export async function logout() {
  const current = currentSession();
  conf.delete("cloudSession");
  if (!current) return;
  // ACT: 本地先退出；云端不可达时只记录错误，这台设备的 Key 可在网页「设备与 API Key」里吊销，90 天未用也会自动失效。
  await request("logout", { body: {}, key: current.key }).catch(error => console.error("麦麦云退出失败：", error));
}
