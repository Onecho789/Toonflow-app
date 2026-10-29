import axios from "axios";
import { ref, shallowRef } from "vue";
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
  });
}
