import type { MediaGenerationRequest } from "@toonflow/tools-scaffold/runtime";
import { findCloudModel, gatewayError, gatewayFetch, type CloudModel } from "@/utils/cloud/models";

type MediaInput = { data: string; mimeType: string };
export type CloudAsset = { type: "url"; url: string } | { type: "base64"; data: string } | { type: "binary"; data: Uint8Array; mimeType: string };
type ImageMeta = { sizePrices?: Record<string, number> };
type VideoMeta = { resolutionPrices?: Record<string, number>; audioPrice?: number };

const dataUrl = (input: MediaInput) => `data:${input.mimeType};base64,${input.data}`;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function postJson<T>(path: string, body: unknown, signal: AbortSignal) {
  const response = await gatewayFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw await gatewayError(response);
  return await response.json() as T;
}

// 与云端网关的计费公式一致，金额单位 0.0001 元；实际以云端扣费为准。
export function estimateCost(model: CloudModel, request: MediaGenerationRequest) {
  if (model.type === "image") return Math.ceil(model.pricing.unit * ((model.meta as ImageMeta).sizePrices?.[request.size ?? ""] ?? 1));
  const meta = model.meta as VideoMeta;
  const audio = request.generateAudio ? meta.audioPrice ?? 1 : 1;
  return Math.ceil(model.pricing.unit * (request.duration ?? 0) * (meta.resolutionPrices?.[request.resolution ?? ""] ?? 1) * audio);
}

export async function getPrice(mediaType: "image" | "video" | "audio", request: MediaGenerationRequest) {
  if (mediaType === "audio") return null;
  const model = await findCloudModel(request.modelId, mediaType);
  if (mediaType === "video" && !request.duration) return null;
  return { price: `¥${(estimateCost(model, request) / 10000).toFixed(2)}`, tips: "预估费用，以麦麦云实际扣费为准" };
}

type VideoMedia = { images?: MediaInput[]; videos?: MediaInput[]; audios?: MediaInput[]; firstFrame?: MediaInput; lastFrame?: MediaInput };

const imageAssets = (data?: { b64_json?: string; url?: string }[]) =>
  (data ?? []).flatMap((item): CloudAsset[] => item.b64_json ? [{ type: "base64", data: item.b64_json }] : item.url ? [{ type: "url", url: item.url }] : []);

// other 里的模型参数（如 quality、background）原样转发给云端，固定字段放在后面，不会被覆盖；size、ratio 缺省时由上游决定。
function imageBody(request: MediaGenerationRequest, images: MediaInput[] | undefined) {
  // model 须保持在请求体第一个字段，选分组时只读请求体开头取模型 ID。
  return Object.assign({ model: request.modelId, ...request.other }, {
    model: request.modelId, prompt: request.prompt, n: 1, size: request.size, aspect_ratio: request.ratio,
    ...(images?.length ? { images: images.map(dataUrl) } : {}),
  });
}

function videoBody(request: MediaGenerationRequest, media: VideoMedia) {
  if (!request.duration || !Number.isInteger(request.duration)) throw Object.assign(new Error("请选择整数秒的视频时长"), { status: 400 });
  const body: Record<string, unknown> = {
    model: request.modelId, prompt: request.prompt, duration: request.duration,
    resolution: request.resolution, aspect_ratio: request.ratio, generate_audio: request.generateAudio,
  };
  // 参考模式（mode 为数组）传参考图、参考视频和参考音频，其余模式传首尾帧。
  if (Array.isArray(request.mode)) {
    if (media.images?.length) body.reference_images = media.images.map(dataUrl);
    if (media.videos?.length) body.reference_videos = media.videos.map(dataUrl);
    if (media.audios?.length) body.reference_audios = media.audios.map(dataUrl);
  } else {
    if (media.videos?.length || media.audios?.length) throw Object.assign(new Error("参考视频与参考音频需要选择全能参考模式"), { status: 400 });
    const first = media.firstFrame ?? media.images?.[0];
    if (first) body.first_frame = dataUrl(first);
    if (media.lastFrame) body.last_frame = dataUrl(media.lastFrame);
  }
  return body;
}

export async function generateImage(request: MediaGenerationRequest, images: MediaInput[] | undefined, signal: AbortSignal): Promise<CloudAsset[]> {
  await findCloudModel(request.modelId, "image");
  const result = await postJson<{ data?: { b64_json?: string; url?: string }[] }>("/images/generations", imageBody(request, images), signal);
  return imageAssets(result.data);
}

// 提交云端任务后立即返回任务 ID，结果由 taskState 查询；页面刷新或应用重启后可凭 ID 继续查询。
export async function submitTask(mediaType: "image" | "video", request: MediaGenerationRequest, media: VideoMedia, signal: AbortSignal) {
  await findCloudModel(request.modelId, mediaType);
  const task = mediaType === "image"
    ? await postJson<{ id: string }>("/images/tasks", imageBody(request, media.images), signal)
    : await postJson<{ id: string }>("/videos", videoBody(request, media), signal);
  if (!task.id) throw new Error("麦麦云未返回任务编号");
  return task.id;
}

export type TaskState = { status: "in_progress" } | { status: "failed"; error: string } | { status: "completed"; assets: CloudAsset[] };

export async function taskState(mediaType: "image" | "video", id: string, signal: AbortSignal): Promise<TaskState> {
  const path = `/${mediaType === "image" ? "images/tasks" : "videos"}/${encodeURIComponent(id)}`;
  const response = await gatewayFetch(path, { signal });
  if (!response.ok) throw await gatewayError(response);
  const state = await response.json() as { status: string; error?: { message?: string } | null; data?: { b64_json?: string; url?: string }[] };
  if (state.status === "failed") return { status: "failed", error: state.error?.message || "生成失败，费用已退回" };
  if (state.status !== "completed") return { status: "in_progress" };
  if (mediaType === "image") return { status: "completed", assets: imageAssets(state.data) };
  const content = await gatewayFetch(`${path}/content`, { signal });
  if (!content.ok) throw await gatewayError(content);
  return { status: "completed", assets: [{ type: "binary", data: new Uint8Array(await content.arrayBuffer()), mimeType: content.headers.get("content-type") ?? "video/mp4" }] };
}

export async function generateVideo(request: MediaGenerationRequest, media: VideoMedia, signal: AbortSignal): Promise<CloudAsset[]> {
  await findCloudModel(request.modelId, "video");
  const task = await postJson<{ id: string }>("/videos", videoBody(request, media), signal);
  // ACT: 每 5 秒查询一次，最多等 30 分钟；云端轮询上游并负责结算，客户端断开不影响扣费结果。
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]);
  while (true) {
    await wait(5000, deadline);
    const state = await taskState("video", task.id, deadline);
    if (state.status === "failed") throw new Error(state.error);
    if (state.status === "completed") return state.assets;
  }
}
