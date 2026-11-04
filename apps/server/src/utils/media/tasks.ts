import { join } from "node:path";
import type { GeneratedMedia, MediaGenerationRequest } from "@toonflow/tools-scaffold/runtime";
import { readFileSync, writeAtomic } from "@toonflow/file";
import { error, errorFromCause, success, type ApiResponse } from "@/lib/responseFormat";
import { collectTaskMedia, generateMedia, submitMediaTask } from "@/utils/media/generation";
import type { ImageCount } from "@/utils/media/cloud";

// 持久化的任务记录：图片和视频提交到麦麦云后保存云端任务编号，应用重启后凭编号继续领取结果。
type TaskRecord = {
  cwd: string;
  mediaType: "image" | "video" | "audio";
  outputDirectory: string;
  cloudTaskId?: string;
  createdAt: number;
  updatedAt: number;
  result?: ApiResponse<GeneratedMedia[]>;
};

type MediaTask = TaskRecord & {
  controller?: AbortController;
  touchedAt: number;
};

const recordsPath = () => join(process.env.TOONFLOW_DATA_DIR ?? ".", "mediaTasks.json");
const keepSettled = 24 * 3600_000;
const maxWaiting = 30 * 60_000;
const expiredMessage = "麦麦云已找不到该任务（可能已过期），请重新生成";

let tasks: Map<string, MediaTask> | undefined;
let saving = Promise.resolve();

// ACT: 首次访问时同步读取一次记录文件，文件损坏或不存在时从空记录开始。
function loaded() {
  if (tasks) return tasks;
  tasks = new Map();
  try {
    const records = JSON.parse(readFileSync(recordsPath(), "utf8")) as Record<string, TaskRecord>;
    for (const [taskId, record] of Object.entries(records)) {
      // 重启前尚未拿到云端编号的任务无法找回，直接标记失败。
      const result = record.result ?? (record.cloudTaskId ? undefined : error<GeneratedMedia[]>("应用重启前任务尚未提交到麦麦云，请重新生成", null, 410));
      tasks.set(taskId, { ...record, result, touchedAt: 0 });
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") console.warn("生成任务记录读取失败，已忽略", cause);
  }
  return tasks;
}

// 只持久化图片和视频任务；音频仍为进程内临时任务。整份快照原子写入，按调用顺序串行。
function save() {
  const snapshot: Record<string, TaskRecord> = {};
  for (const [taskId, { cwd, mediaType, outputDirectory, cloudTaskId, createdAt, updatedAt, result }] of loaded()) {
    if (mediaType !== "audio") snapshot[taskId] = { cwd, mediaType, outputDirectory, cloudTaskId, createdAt, updatedAt, result };
  }
  const content = JSON.stringify(snapshot);
  saving = saving.then(() => writeAtomic(recordsPath(), content)).catch(cause => console.warn("生成任务记录保存失败", cause));
}

function settle(task: MediaTask, result: ApiResponse<GeneratedMedia[]>) {
  if (task.result) return;
  task.result = result;
  task.updatedAt = Date.now();
  task.controller = undefined;
  if (task.mediaType !== "audio") save();
}

function stop(task: MediaTask, message: string) {
  if (task.result) return;
  const controller = task.controller;
  settle(task, error<GeneratedMedia[]>(message, null, 499));
  controller?.abort(new Error(message));
}

function cleanup() {
  const now = Date.now();
  let changed = false;
  for (const [taskId, task] of loaded()) {
    if (task.result) {
      if (task.updatedAt + (task.mediaType === "audio" ? 300000 : keepSettled) <= now) { loaded().delete(taskId); changed = true; }
    } else if (task.controller && task.touchedAt + 120000 <= now) {
      // 音频没有云端任务可找回，页面断开后停止；图片和视频只停止本地领取，记录保留，节点重新连接后继续。
      if (task.mediaType === "audio") stop(task, "生成任务因页面长时间未连接而停止");
      else { task.controller.abort(new Error("页面长时间未连接，暂停领取结果")); task.controller = undefined; }
    }
  }
  if (changed) save();
}

const cleanupTimer = setInterval(cleanup, 30000);
cleanupTimer.unref();

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// 轮询云端任务直到完成、失败或超时；网络和网关错误继续重试，404/410 视为云端已无此任务。
async function follow(task: MediaTask, mediaType: "image" | "video", signal: AbortSignal) {
  const interval = mediaType === "image" ? 3000 : 5000;
  while (!task.result) {
    if (task.createdAt + maxWaiting <= Date.now()) return settle(task, error<GeneratedMedia[]>("等待麦麦云生成结果超时，请重新生成", null, 504));
    try {
      const state = await collectTaskMedia(task.cwd, mediaType, task.cloudTaskId!, task.outputDirectory, signal);
      if (state.status === "completed") return settle(task, success(state.media));
      if (state.status === "failed") return settle(task, error<GeneratedMedia[]>(state.error, null, 502));
    } catch (cause) {
      if (signal.aborted) return;
      const status = (cause as { status?: number }).status;
      if (status === 404 || status === 410) return settle(task, error<GeneratedMedia[]>(expiredMessage, null, 410));
      if (status && status < 500 && status !== 429) return settle(task, { ...errorFromCause(cause), data: null } as ApiResponse<GeneratedMedia[]>);
    }
    await wait(interval, signal);
  }
}

function resume(task: MediaTask) {
  if (task.result || task.controller || !task.cloudTaskId || task.mediaType === "audio") return;
  const controller = new AbortController();
  task.controller = controller;
  void follow(task, task.mediaType, controller.signal).catch(() => {}).finally(() => { if (task.controller === controller) task.controller = undefined; });
}

export function start(cwd: string, taskId: string, mediaType: "image" | "video" | "audio", request: MediaGenerationRequest & ImageCount) {
  cleanup();
  const all = loaded();
  if (all.has(taskId)) throw Object.assign(new Error("生成任务已存在，请勿重复提交"), { status: 409 });
  // ACT: 最多 1000 个进行中的任务；取消后仍等待生成 Promise 收尾，避免忽略取消的供应商绕过上限。
  if ([...all.values()].filter(task => !task.result).length >= 1000) throw Object.assign(new Error("生成任务过多，请稍后重试"), { status: 429 });
  const now = Date.now();
  const task: MediaTask = { cwd, mediaType, outputDirectory: request.outputDirectory ?? "assets/generated", createdAt: now, updatedAt: now, controller: new AbortController(), touchedAt: now };
  all.set(taskId, task);
  const signal = task.controller!.signal;
  if (mediaType === "audio") {
    void generateMedia(cwd, mediaType, request, signal).then(
      files => settle(task, success(files)),
      cause => settle(task, { ...errorFromCause(cause), data: null } as ApiResponse<GeneratedMedia[]>),
    );
    return;
  }
  void submitMediaTask(cwd, mediaType, request, signal).then(cloudTaskId => {
    if (task.result) return;
    task.cloudTaskId = cloudTaskId;
    task.updatedAt = Date.now();
    save();
    return follow(task, mediaType, signal);
  }).catch(cause => {
    // 已拿到云端编号时中断只是暂停领取；提交阶段被中断则任务无法找回，标记失败。
    if (!signal.aborted || !task.cloudTaskId) settle(task, signal.aborted ? error<GeneratedMedia[]>("生成任务提交被中断，请重新生成", null, 499) : { ...errorFromCause(cause), data: null } as ApiResponse<GeneratedMedia[]>);
  }).finally(() => { if (task.controller?.signal === signal) task.controller = undefined; });
}

export function status(cwd: string, taskIds: string[]) {
  cleanup();
  return taskIds.map(taskId => {
    const task = loaded().get(taskId);
    if (!task || task.cwd !== cwd) return { taskId, result: error<GeneratedMedia[]>("生成任务不存在或已过期", null, 404) };
    task.touchedAt = Date.now();
    // 重启或页面断开后，节点再次查询时继续领取云端结果。
    resume(task);
    return { taskId, ...(task.result ? { result: task.result } : {}) };
  });
}

// ACT: 云端任务提交后无法撤回，取消只停止本地领取；扣费以麦麦云为准。
export function cancel(cwd: string, taskIds: string[]) {
  for (const taskId of taskIds) {
    const task = loaded().get(taskId);
    if (task?.cwd === cwd) stop(task, "生成已取消");
  }
}
