import axios from "axios";
import { reactive } from "vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";

export type HistoryType = "image" | "video";
export type HistoryItem = { taskId?: string; status: "pending" | "completed" | "failed"; error?: string; files: string[] };
// input 是提交给工作台接口的完整参数（不含目录）；prompt 是用户原始输入，form 是界面选项，二者只用于回填。
export type HistoryRecord = { id: string; createdAt: number; prompt: string; input: Record<string, unknown>; form: Record<string, unknown>; items: HistoryItem[] };
export type HistoryBook = { records: HistoryRecord[]; loaded: boolean; error: string };
type BookState = { book: HistoryBook; directory: string; type: HistoryType; saving: Promise<void>; timer?: ReturnType<typeof setTimeout> };

export const outputDirectory = "generated";
const pollInterval = 5000;
// ACT: 记录上限 500 条，超出时丢弃最旧的记录（文件保留）；需要更多时再分页存储。
const recordLimit = 500;
const client = axios.create({ baseURL: "/api/workbench", headers: { "x-toonflow-workspace": "1" }, timeout: 120000 });
const states = new Map<string, BookState>();

export function errorText(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string }>(error)) return error.response?.data?.message || error.message || fallback;
  return error instanceof Error ? error.message || fallback : fallback;
}

// 生成记录按“类型 + 文件夹”缓存在内存，离开页面后轮询继续；刷新或重启后从文件读取并继续查询未完成的任务。
// 生图与视频分别写 imageHistory.json、videoHistory.json，两个工作台选同一文件夹也不会互相覆盖。
export function useHistory(type: HistoryType, directory: string) {
  const key = `${type}\n${directory}`;
  let state = states.get(key);
  if (state) return state.book;
  state = { book: reactive({ records: [], loaded: false, error: "" }), directory, type, saving: Promise.resolve() };
  states.set(key, state);
  void load(state);
  return state.book;
}

async function load(state: BookState) {
  try {
    const data = await useWorkspaceFiles(state.directory).readJson<{ records?: HistoryRecord[] }>(`${state.type}History.json`).catch(error => {
      if (axios.isAxiosError(error) && error.response?.status === 404) return { records: [] };
      throw error;
    });
    // 结构由本模块写入，读取时仍过滤掉明显无效的条目。
    state.book.records = (Array.isArray(data.records) ? data.records : []).filter(item => item && typeof item.id === "string" && Array.isArray(item.items));
    let changed = false;
    for (const item of state.book.records.flatMap(record => record.items)) {
      // 没有任务编号说明上次提交未确认，云端不会续查，标为失败供用户重试。
      if (item.status === "pending" && !item.taskId) {
        Object.assign(item, { status: "failed", error: "上次提交未完成，请重试" });
        changed = true;
      }
    }
    state.book.loaded = true;
    if (changed) save(state);
    schedule(state, 0);
  } catch (error) {
    state.book.error = errorText(error, "生成记录读取失败");
    states.delete(`${state.type}\n${state.directory}`);
  }
}

function save(state: BookState) {
  // 串行写入完整快照，后一次写入总是包含前面的修改。
  state.saving = state.saving.then(() => useWorkspaceFiles(state.directory).writeJson(`${state.type}History.json`, { version: 1, records: state.book.records }))
    .then(() => { state.book.error = ""; }, error => { state.book.error = errorText(error, "生成记录保存失败"); });
  return state.saving;
}

function schedule(state: BookState, delay = pollInterval) {
  if (state.timer !== undefined) return;
  if (!state.book.records.some(record => record.items.some(item => item.status === "pending" && item.taskId))) return;
  state.timer = setTimeout(() => void poll(state), delay);
}

async function poll(state: BookState) {
  const pending = state.book.records.flatMap(record => record.items).filter(item => item.status === "pending" && item.taskId);
  let changed = false;
  await Promise.all(pending.map(async item => {
    try {
      const { data } = await client.post<{ data: { status: string; error?: string; files?: string[] } }>("/collect", {
        directory: state.directory, mediaType: state.type, taskId: item.taskId, outputDirectory,
      });
      const result = data.data;
      if (result.status === "completed") Object.assign(item, { status: "completed", files: result.files ?? [] });
      else if (result.status === "failed") Object.assign(item, { status: "failed", error: result.error || "生成失败" });
      else return;
      changed = true;
    } catch (error) {
      // 任务不存在或结果已过期时不再查询；网络等临时错误保持进行中，下一轮继续。
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status !== 404 && status !== 410) return;
      Object.assign(item, { status: "failed", error: errorText(error, "任务已失效") });
      changed = true;
    }
  }));
  state.timer = undefined;
  if (changed) {
    window.dispatchEvent(new Event("toonflow:media-generated"));
    await save(state);
  }
  schedule(state);
}

function stateOf(type: HistoryType, directory: string) {
  const state = states.get(`${type}\n${directory}`);
  if (!state?.book.loaded) throw new Error("生成记录尚未读取完成，请稍后重试");
  return state;
}

async function submitItem(state: BookState, record: HistoryRecord, item: HistoryItem) {
  try {
    const { data } = await client.post<{ data: { taskId: string } }>("/submit", { ...record.input, directory: state.directory, mediaType: state.type });
    item.taskId = data.data.taskId;
    window.dispatchEvent(new Event("toonflow:media-generated"));
  } catch (error) {
    Object.assign(item, { status: "failed", error: errorText(error, "提交失败") });
  }
  await save(state);
  schedule(state, pollInterval);
}

// 一条记录包含 count 个独立任务，并发提交，每个任务单独轮询、单独重试。
export async function submitRecord(type: HistoryType, directory: string, prompt: string, input: Record<string, unknown>, form: Record<string, unknown>, count: number) {
  const state = stateOf(type, directory);
  const record: HistoryRecord = reactive({
    id: crypto.randomUUID(), createdAt: Date.now(), prompt, input, form,
    items: Array.from({ length: count }, (): HistoryItem => ({ status: "pending", files: [] })),
  });
  state.book.records.unshift(record);
  state.book.records.splice(recordLimit);
  await save(state);
  void Promise.all(record.items.map(item => submitItem(state, record, item)));
  return record;
}

export async function retryItem(type: HistoryType, directory: string, record: HistoryRecord, item: HistoryItem) {
  const state = stateOf(type, directory);
  Object.assign(item, { status: "pending", error: undefined, taskId: undefined, files: [] });
  await save(state);
  await submitItem(state, record, item);
}

// 只删除记录，已生成的文件保留在文件夹里。
export async function removeRecord(type: HistoryType, directory: string, id: string) {
  const state = stateOf(type, directory);
  state.book.records = state.book.records.filter(record => record.id !== id);
  await save(state);
}
