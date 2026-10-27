import { z } from "zod";
import { defaultImageProtocols, type ImageProtocol, type JsonValue } from "@toonflow/providers/imageProtocols";
import conf from "@/utils/conf";

const variableNames = new Set(["model", "modelName", "prompt", "n", "size", "ratio", "quality", "outputFormat", "images", "parts"]);
const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);
const pathSchema = z.string().max(512).refine(value => !value || value.split(".").every(key => /^(?:[a-zA-Z0-9_]+|\*)$/.test(key) && !forbiddenKeys.has(key)), "结果路径使用点分隔，数组可使用 *");
const endpointSchema = z.string().max(2048).refine(value => !value || /^\/(?!\/)[^\s?#\\]*$/.test(value) && !value.split("/").some(part => part === "." || part === ".."), "接口路径须以 / 开头，不含域名、查询参数或片段");

function validTemplate(value: JsonValue): boolean {
  if (typeof value === "string") return [...value.matchAll(/\{\{([^{}]+)\}\}/g)].every(match => variableNames.has(match[1]!));
  if (Array.isArray(value)) return value.every(validTemplate);
  return !value || typeof value !== "object" || Object.entries(value).every(([key, item]) => !forbiddenKeys.has(key) && validTemplate(item));
}

const bodySchema = z.record(z.string(), z.json()).refine(validTemplate, "请求模板含未知变量或保留字段");
export const imageProtocolSchema = z.object({
  id: z.string().min(1).max(96).regex(/^[a-z][a-zA-Z0-9]*$/),
  label: z.string().min(1).max(200).refine(value => !!value.trim()),
  generationPath: endpointSchema.refine(Boolean, "请填写文生图路径"),
  editPath: endpointSchema,
  editEncoding: z.enum(["multipart", "json"]),
  imageField: z.string().min(1).max(100).regex(/^[a-zA-Z][a-zA-Z0-9_.\[\]]*$/),
  authHeader: z.string().max(100).refine(value => !value || /^[!#$%&'*+.^_`|~a-zA-Z0-9-]+$/.test(value), "鉴权请求头无效"),
  authPrefix: z.string().max(100).regex(/^[\x20-\x7e]*$/),
  generationBody: bodySchema,
  editBody: bodySchema,
  response: z.object({
    itemsPath: pathSchema, urlPath: pathSchema, base64Path: pathSchema, mimeTypePath: pathSchema,
    mimeType: z.string().regex(/^image\/[a-zA-Z0-9.+-]+$/),
  }).strict().refine(value => !!value.urlPath || !!value.base64Path, "至少配置一种图片结果读取路径"),
  imageSizes: z.array(z.string().min(1).max(64).regex(/^[^\u0000-\u001f\u007f]+$/)).min(1).max(100),
  imageRatios: z.array(z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/)).min(1).max(100),
  sizeMap: z.record(z.string(), z.record(z.string(), z.string().max(100))).refine(value => validTemplate(value), "尺寸映射包含保留字段"),
}).strict().refine(value => [value.generationPath, value.editPath].every(validTemplate), "接口路径含未知变量");

export const imageProtocolsSchema = z.array(imageProtocolSchema).max(100).refine(items => new Set(items.map(item => item.id)).size === items.length, "生图协议 ID 不能重复");

export function getImageProtocols(settings: Record<string, unknown> = conf.get("settings", {})): ImageProtocol[] {
  return imageProtocolsSchema.parse(settings.imageProtocols === undefined ? defaultImageProtocols : settings.imageProtocols);
}

export function assertImageProtocols(ids: (string | undefined)[]) {
  const available = new Set(getImageProtocols().map(protocol => protocol.id));
  const id = ids.find(id => id && !available.has(id));
  if (id) {
    throw Object.assign(new Error(`生图协议 ${id} 不存在，请重新选择`), { status: 400 });
  }
}

function renderTemplate(value: JsonValue, variables: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const exact = /^\{\{([^{}]+)\}\}$/.exec(value);
    if (exact) return variables[exact[1]!];
    return value.replace(/\{\{([^{}]+)\}\}/g, (_, key) => String(variables[key] ?? ""));
  }
  if (Array.isArray(value)) return value.map(item => renderTemplate(item, variables)).filter(item => item !== undefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplate(item, variables)]).filter(([, item]) => item !== undefined));
  return value;
}

function readValues(value: unknown, path: string): unknown[] {
  let values = [value];
  for (const key of path ? path.split(".") : []) {
    values = values.flatMap(item => {
      if (key === "*") return Array.isArray(item) ? item : [];
      return item && typeof item === "object" && Object.hasOwn(item, key) ? [(item as Record<string, unknown>)[key]] : [];
    });
  }
  return values.flatMap(item => Array.isArray(item) ? item : [item]);
}

function requestUrl(apiUrl: string, path: string, variables: Record<string, unknown>) {
  const url = new URL(apiUrl);
  const endpoint = path.replace(/\{\{([^{}]+)\}\}/g, (_, key) => encodeURIComponent(String(variables[key] ?? "")));
  const baseParts = url.pathname.split("/").filter(Boolean);
  const pathParts = endpoint.split("/").filter(Boolean);
  let overlap = Math.min(baseParts.length, pathParts.length);
  while (overlap && baseParts.slice(-overlap).join("/") !== pathParts.slice(0, overlap).join("/")) overlap--;
  url.pathname = `/${[...baseParts, ...pathParts.slice(overlap)].join("/")}`;
  url.search = "";
  url.hash = "";
  return url;
}

export async function generateProtocolImage(this: ProviderContext, protocol: ImageProtocol, request: ImageRequest): Promise<MediaAsset[]> {
  const editing = !!request.images?.length;
  if (editing && !protocol.editPath) throw new Error("当前生图协议未配置参考图接口，请先在设置中配置");
  if (request.mask) throw new Error("当前通用生图协议不支持蒙版，请使用供应商适配文件");
  const size = request.size ?? protocol.imageSizes[0]!;
  const ratio = request.ratio ?? protocol.imageRatios[0]!;
  if (!protocol.imageSizes.includes(size) || !protocol.imageRatios.includes(ratio)) throw new Error("图片尺寸或比例不在当前生图协议的支持范围内");
  const sizeMap = protocol.sizeMap[size];
  const mappedSize = sizeMap?.[ratio] ?? sizeMap?.["*"];
  if (sizeMap && mappedSize === undefined) throw new Error(`请在生图协议中配置 ${size} / ${ratio} 的尺寸映射`);
  const images = [];
  for (const input of request.images ?? []) {
    this.signal?.throwIfAborted();
    let data: Uint8Array;
    let mimeType = input.mimeType ?? "image/png";
    if (input.type === "url") {
      const response = await this.tool.fetch(input.url, { redirect: "error" });
      if (!response.ok) throw new Error(`读取参考图失败（HTTP ${response.status}）`);
      data = new Uint8Array(await response.arrayBuffer());
      mimeType = response.headers.get("content-type")?.split(";")[0] ?? mimeType;
    } else if (input.type === "base64") {
      const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(input.data);
      data = Buffer.from(match?.[2] ?? input.data, "base64");
      mimeType = match?.[1] ?? mimeType;
    } else data = input.data;
    if (!mimeType.startsWith("image/") || !data.byteLength || data.byteLength > 100 * 1024 * 1024) throw new Error("参考图须为不超过 100 MB 的图片");
    images.push({ data, mimeType, name: input.name?.split(/[\\/]/).pop() ?? "reference.png" });
  }
  const variables = {
    model: request.model, modelName: request.model.replace(/^models\//, ""), prompt: request.prompt, n: request.n ?? 1,
    size: mappedSize === "" ? undefined : mappedSize ?? size, ratio, quality: request.quality, outputFormat: request.outputFormat,
    images: images.map(image => `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`),
    parts: [{ text: request.prompt }, ...images.map(image => ({ inlineData: { mimeType: image.mimeType, data: Buffer.from(image.data).toString("base64") } }))],
  };
  const headers = new Headers({ Accept: "application/json" });
  if (protocol.authHeader) {
    const apiKey = String(this.config.apiKey ?? "").trim().replace(/^Bearer\s+/i, "");
    if (!apiKey) throw new Error("请先配置供应商 API Key");
    headers.set(protocol.authHeader, `${protocol.authPrefix}${apiKey}`);
  }
  const rendered = renderTemplate(editing ? protocol.editBody : protocol.generationBody, variables) as Record<string, unknown>;
  let body: NonNullable<RequestInit["body"]>;
  if (editing && protocol.editEncoding === "multipart") {
    const form = new FormData();
    for (const [key, value] of Object.entries(rendered)) form.append(key, typeof value === "string" ? value : JSON.stringify(value));
    for (const image of images) form.append(protocol.imageField, new Blob([Buffer.from(image.data)], { type: image.mimeType }), image.name);
    body = form;
  } else {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(rendered);
  }
  const response = await this.tool.fetch(requestUrl(String(this.config.apiUrl), editing ? protocol.editPath : protocol.generationPath, variables), {
    method: "POST", headers, body, signal: this.signal, redirect: "error",
  });
  if (!response.ok) throw new Error(`图片生成失败（HTTP ${response.status}）`);
  const result: unknown = await response.json();
  const assets: MediaAsset[] = [];
  for (const item of readValues(result, protocol.response.itemsPath)) {
    const base64 = protocol.response.base64Path ? readValues(item, protocol.response.base64Path)[0] : undefined;
    const url = protocol.response.urlPath ? readValues(item, protocol.response.urlPath)[0] : undefined;
    const mimeType = (protocol.response.mimeTypePath ? readValues(item, protocol.response.mimeTypePath)[0] : undefined) ?? protocol.response.mimeType;
    if (typeof base64 === "string" && base64) assets.push({ mediaType: "image", type: "base64", data: base64, mimeType: String(mimeType) });
    else if (typeof url === "string" && /^https?:\/\//i.test(url)) assets.push({ mediaType: "image", type: "url", url, mimeType: String(mimeType) });
  }
  if (!assets.length) throw new Error(this.tool.errorMessage(result) || "接口未返回图片，请检查生图协议中的结果读取路径");
  return assets;
}
