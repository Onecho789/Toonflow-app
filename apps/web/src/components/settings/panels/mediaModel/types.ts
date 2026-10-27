export type MediaProviderModel = {
  id: string;
  label: string;
  type: "text" | "image" | "video" | "audio";
  [key: string]: unknown;
};

export type MediaListedModel = { id: string; label: string; imageProtocolId?: string };

export type MediaProvider = {
  fileName: string;
  id: string;
  label: string;
  icon?: string;
  version?: string;
  readme?: string;
  modelsUrl?: string;
  modelConnection?: { apiUrl: string; protocol: "openai" | "anthropic" | "gemini" | "openai-completions" | "openai-responses" | "anthropic-messages" };
  imageProtocolId?: string;
  listedModels?: MediaListedModel[];
  adapter?: { id: string; label: string; models: MediaProviderModel[] };
  generationTypes?: string[];
  rules?: Record<string, unknown>[];
  models: MediaProviderModel[];
  revision: string;
  loadError?: string;
};
