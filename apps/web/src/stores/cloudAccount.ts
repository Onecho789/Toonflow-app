import axios from "axios";
import { ref, shallowRef } from "vue";
import type { CloudUser } from "@toonflow/server/desktop";

export const cloudAccount = shallowRef<CloudUser | null>(null);
export const cloudAccountLoading = ref(false);
export const cloudAccountError = ref("");
const client = axios.create({ baseURL: "/api/cloud", headers: { "x-toonflow-workspace": "1" }, timeout: 20000 });

function errorMessage(error: unknown) {
  return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : String(error);
}

async function run(action: () => Promise<void>) {
  cloudAccountLoading.value = true;
  cloudAccountError.value = "";
  try { await action(); }
  catch (error) { cloudAccountError.value = errorMessage(error); }
  finally { cloudAccountLoading.value = false; }
}

export function loadCloudAccount() {
  return run(async () => { cloudAccount.value = (await client.get<{ data: CloudUser | null }>("/account")).data.data; });
}

// 系统浏览器打开云端登录页；登录完成后经 maimai://auth 回到客户端，由 finishCloudLogin 换取会话。
export function startCloudLogin() {
  return run(async () => { window.open((await client.post<{ data: { url: string } }>("/login")).data.data.url, "_blank", "noopener"); });
}

export function finishCloudLogin(code: string, state: string) {
  return run(async () => { cloudAccount.value = (await client.post<{ data: CloudUser }>("/callback", { code, state })).data.data; });
}

export function logoutCloudAccount() {
  return run(async () => {
    await client.post("/logout");
    cloudAccount.value = null;
  });
}
