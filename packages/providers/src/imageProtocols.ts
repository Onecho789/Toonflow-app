export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ImageProtocol {
  id: string;
  label: string;
  generationPath: string;
  editPath: string;
  editEncoding: "multipart" | "json";
  imageField: string;
  authHeader: string;
  authPrefix: string;
  generationBody: Record<string, JsonValue>;
  editBody: Record<string, JsonValue>;
  response: { itemsPath: string; urlPath: string; base64Path: string; mimeTypePath: string; mimeType: string };
  imageSizes: string[];
  imageRatios: string[];
  sizeMap: Record<string, Record<string, string>>;
}

export const defaultImageProtocols: ImageProtocol[] = [
  {
    id: "openaiImages", label: "OpenAI 兼容生图",
    generationPath: "/v1/images/generations", editPath: "/v1/images/edits",
    editEncoding: "multipart", imageField: "image[]", authHeader: "Authorization", authPrefix: "Bearer ",
    generationBody: { model: "{{model}}", prompt: "{{prompt}}", n: "{{n}}", size: "{{size}}", quality: "{{quality}}" },
    editBody: { model: "{{model}}", prompt: "{{prompt}}", n: "{{n}}", size: "{{size}}", quality: "{{quality}}" },
    response: { itemsPath: "data", urlPath: "url", base64Path: "b64_json", mimeTypePath: "", mimeType: "image/png" },
    imageSizes: ["1K"], imageRatios: ["1:1", "3:2", "2:3"],
    sizeMap: { "1K": { "1:1": "1024x1024", "3:2": "1536x1024", "2:3": "1024x1536" } },
  },
  {
    id: "geminiImages", label: "Gemini 生图",
    generationPath: "/v1beta/models/{{modelName}}:generateContent", editPath: "/v1beta/models/{{modelName}}:generateContent",
    editEncoding: "json", imageField: "images", authHeader: "x-goog-api-key", authPrefix: "",
    generationBody: {
      contents: [{ parts: "{{parts}}" }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "{{ratio}}", imageSize: "{{size}}" } },
    },
    editBody: {
      contents: [{ parts: "{{parts}}" }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "{{ratio}}", imageSize: "{{size}}" } },
    },
    response: { itemsPath: "candidates.*.content.parts.*", urlPath: "fileData.fileUri", base64Path: "inlineData.data", mimeTypePath: "inlineData.mimeType", mimeType: "image/png" },
    imageSizes: ["1K", "2K", "4K"], imageRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], sizeMap: {},
  },
];
