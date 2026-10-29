import axios from "axios";
import { onScopeDispose, ref, shallowRef } from "vue";
import type { CloudUser } from "@toonflow/server/desktop";

export const cloudAccount = shallowRef<CloudUser | null>(null);
export const cloudAccountLoading = ref(false);
export const cloudAccountError = ref("");
const client = axios.create({ baseURL: "/api/cloud", headers: { "x-toonflow-workspace": "1" }, timeout: 20000 });

function errorMessage(error: unknown) {
  return axios.isAxiosError<{ message?: string; data?: unknown }>(error)
    ? [error.response?.data?.message || error.message, ...(Array.isArray(error.response?.data?.data) ? error.response.data.data : [])].join("：")
    : error instanceof Error ? error.message : String(error);
}

async function run(action: () => Promise<void>) {
  cloudAccountLoading.value = true;
  cloudAccountError.value = "";
  try { await action(); }
  catch (error) { cloudAccountError.value = errorMessage(error); }
  finally { cloudAccountLoading.value = false; }
}

// 会话保存在主机本地；云端不可达时服务端沿用已保存的账号，互联设备跟随主机登录状态。
export function loadCloudAccount() {
  return run(async () => { cloudAccount.value = (await client.get<{ data: CloudUser | null }>("/account")).data.data; });
}

export function loginCloudAccount(email: string, password: string) {
  return run(async () => { cloudAccount.value = (await client.post<{ data: CloudUser }>("/login", { email, password })).data.data; });
}

export function registerCloudAccount(email: string, code: string, password: string) {
  return run(async () => { cloudAccount.value = (await client.post<{ data: CloudUser }>("/register", { email, code, password })).data.data; });
}

export async function sendCloudCode(email: string) {
  let sent = false;
  await run(async () => { await client.post("/code", { email }); sent = true; });
  return sent;
}

export function changeCloudPassword(oldPassword: string, newPassword: string) {
  return run(async () => { cloudAccount.value = (await client.post<{ data: CloudUser }>("/password", { oldPassword, newPassword })).data.data; });
}

export function logoutCloudAccount() {
  return run(async () => {
    await client.post("/logout");
    cloudAccount.value = null;
    cloudBalance.value = null;
  });
}

// 余额单位为 0.0001 元，充值页地址由本机服务返回。
export const cloudBalance = shallowRef<{ balance: number; walletUrl: string } | null>(null);
export const cloudBalanceLoading = ref(false);
export const cloudBalanceError = ref("");
let balanceRequest: Promise<void> | undefined;

export function loadCloudBalance() {
  if (!cloudAccount.value) {
    cloudBalance.value = null;
    return Promise.resolve();
  }
  balanceRequest ??= (async () => {
    cloudBalanceLoading.value = true;
    try {
      cloudBalance.value = (await axios.post<{ data: { balance: number; walletUrl: string } }>("/api/ai/media/balance", {}, { headers: { "x-toonflow-workspace": "1" }, timeout: 20000 })).data.data;
      cloudBalanceError.value = "";
    } catch (error) { cloudBalanceError.value = errorMessage(error); }
    finally {
      cloudBalanceLoading.value = false;
      balanceRequest = undefined;
    }
  })();
  return balanceRequest;
}

// ACT: 余额不做推送订阅，工作区显示、窗口获得焦点和媒体生成结束后重新查询；文本对话扣费后等下次触发再更新。
export function useCloudBalanceRefresh() {
  const refresh = () => { if (document.visibilityState !== "hidden") void loadCloudBalance(); };
  refresh();
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("toonflow:media-generated", refresh);
  document.addEventListener("visibilitychange", refresh);
  onScopeDispose(() => {
    window.removeEventListener("focus", refresh);
    window.removeEventListener("pageshow", refresh);
    window.removeEventListener("toonflow:media-generated", refresh);
    document.removeEventListener("visibilitychange", refresh);
  });
}
