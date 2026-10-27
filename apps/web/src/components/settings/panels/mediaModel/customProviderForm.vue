<template>
  <div class="customProviderForm">
    <el-form labelPosition="top" :disabled="busy" @submit.prevent>
      <el-form-item label="供应商名称">
        <el-input v-model="label" maxlength="200" :disabled="!!savedProvider" aria-label="供应商名称" />
      </el-form-item>
      <el-form-item label="模型列表协议">
        <el-select v-model="protocol" :disabled="!!savedProvider" aria-label="模型列表协议">
          <el-option label="OpenAI 兼容" value="openai" />
          <el-option label="Anthropic（Claude）" value="anthropic" />
          <el-option label="Google Gemini" value="gemini" />
        </el-select>
      </el-form-item>
      <el-form-item label="API 地址">
        <el-input v-model="apiUrl" :disabled="!!savedProvider" maxlength="2048" placeholder="https://api.example.com/v1" dir="ltr" aria-label="API 地址" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="apiKey" type="password" showPassword autocomplete="off" maxlength="8192" dir="ltr" aria-label="API Key" />
      </el-form-item>
      <el-form-item label="默认生图协议">
        <el-select :modelValue="imageProtocolId || '__none'" :disabled="!!savedProvider || loadingProtocols" aria-label="默认生图协议" @update:modelValue="imageProtocolId = $event === '__none' ? '' : $event">
          <el-option label="不使用内置生图协议" value="__none" />
          <el-option v-for="item in imageProtocols" :key="item.id" :label="item.label" :value="item.id" />
          <el-option v-if="imageProtocolId && !imageProtocols.some(item => item.id === imageProtocolId)" :label="`协议已移除：${imageProtocolId}`" :value="imageProtocolId" disabled />
        </el-select>
        <el-text type="info" size="small">只给需要生图的模型选择协议。协议可在设置的“生图协议”中管理。</el-text>
      </el-form-item>
      <div class="modelHeader">
        <el-text tag="strong">选择要使用的模型</el-text>
        <el-button text type="primary" :icon="IconDownload" :loading="fetching" :disabled="busy || !!savedProvider || !apiUrl.trim()" @click="fetchModels">获取模型</el-button>
      </div>
      <div v-if="models.length" class="modelList">
        <div v-for="model in models" :key="model.id" class="modelRow">
          <el-checkbox :modelValue="selectedIds.includes(model.id)" :disabled="busy || !!savedProvider" :aria-label="`选择模型 ${model.id}`" @change="toggleModel(model.id, $event)">
            {{ model.id }}
            <el-tag v-if="supportedIds.has(model.id)" size="small" type="success">使用适配文件</el-tag>
          </el-checkbox>
          <el-select v-if="selectedIds.includes(model.id) && !supportedIds.has(model.id)" :modelValue="model.imageProtocolId === '' ? '__none' : model.imageProtocolId ?? '__inherit'" :disabled="busy || !!savedProvider || loadingProtocols" :aria-label="`${model.id} 生图协议`" @update:modelValue="setModelProtocol(model, $event)">
            <el-option label="继承默认生图协议" value="__inherit" />
            <el-option label="仅保留模型列表" value="__none" />
            <el-option v-for="item in imageProtocols" :key="item.id" :label="item.label" :value="item.id" />
            <el-option v-if="model.imageProtocolId && !imageProtocols.some(item => item.id === model.imageProtocolId)" :label="`协议已移除：${model.imageProtocolId}`" :value="model.imageProtocolId" disabled />
          </el-select>
        </div>
      </div>
      <el-text class="modelHint" type="info" size="small">已选 {{ selectedIds.length }} 个，{{ enabledCount }} 个可用于生成。</el-text>
      <el-text v-if="adapter" class="adapterInfo" size="small">已导入：{{ adapter.label }}{{ adapterSource === undefined ? '' : '，保存后生效' }}。</el-text>
      <el-text v-else class="adapterInfo" type="info" size="small">选择对应生图协议并保存后，可在画布中使用；特殊接口可导入供应商适配文件。</el-text>
    </el-form>
    <form-create v-if="formRules.length" v-model="formValues" v-model:api="formApi" :rule="formRules" :option="formOptions" />
    <el-alert v-if="formError" :title="formError" type="error" :closable="false" showIcon />
  </div>
  <component :is="adapterDialog" v-model="adapterVisible" @confirmed="useAdapter" />
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch, type Component } from "vue";
import { IconDownload } from "@tabler/icons-vue";
import formCreate, { type Api, type Options } from "../../formCreate";
import { settings, saveSettings } from "@/stores/settings";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import type { ImageProtocol } from "@toonflow/providers/imageProtocols";
import type { MediaListedModel, MediaProvider } from "./types";

const props = defineProps<{ provider?: MediaProvider }>();
const emit = defineEmits<{ saved: [provider: MediaProvider]; completed: [] }>();
const label = ref("");
const protocol = ref<"openai" | "anthropic" | "gemini">("openai");
const apiUrl = ref("");
const apiKey = ref("");
const models = ref<MediaListedModel[]>([]);
const imageProtocols = ref<ImageProtocol[]>([]);
const imageProtocolId = ref("");
const loadingProtocols = ref(true);
const selectedIds = ref<string[]>([]);
const savedProvider = shallowRef<MediaProvider>();
const fetching = ref(false);
const saving = ref(false);
const formError = ref("");
const adapterDialog = shallowRef<Component>();
const adapterVisible = ref(false);
const adapterSource = ref<string>();
const importedAdapter = shallowRef<MediaProvider>();
const adapter = computed(() => importedAdapter.value ?? props.provider?.adapter);
const supportedIds = computed(() => new Set(adapter.value?.models.map(model => model.id)));
const enabledCount = computed(() => models.value.filter(model => selectedIds.value.includes(model.id)
  && (supportedIds.value.has(model.id) || imageProtocols.value.some(item => item.id === (model.imageProtocolId ?? imageProtocolId.value)))).length);
const formApi = shallowRef<Api>();
const formValues = ref<Record<string, unknown>>({});
const initialConfig = ref<Record<string, unknown>>({});
const formRules = computed(() => formCreate.copyRules((importedAdapter.value?.rules ?? props.provider?.rules ?? [])
  .filter(rule => !["apiUrl", "apiKey", "protocol"].includes(String(rule.field)))
  .map(rule => Object.hasOwn(initialConfig.value, String(rule.field)) ? { ...rule, value: initialConfig.value[String(rule.field)] } : rule)));
const formOptions = computed<Options>(() => ({ form: { labelPosition: "top", disabled: busy.value || !!savedProvider.value }, appendValue: false, submitBtn: false, resetBtn: false }));
const busy = computed(() => fetching.value || saving.value);
const canSubmit = computed(() => !loadingProtocols.value && !!label.value.trim() && !!apiUrl.value.trim() && !!selectedIds.value.length);
let activeRequest: AbortController | undefined;

watch(() => props.provider, provider => {
  activeRequest?.abort();
  savedProvider.value = undefined;
  adapterSource.value = undefined;
  importedAdapter.value = undefined;
  formValues.value = {};
  initialConfig.value = {};
  label.value = provider?.label ?? "";
  const connection = provider?.modelConnection;
  protocol.value = connection?.protocol === "gemini" ? "gemini" : connection?.protocol.startsWith("anthropic") ? "anthropic" : "openai";
  apiUrl.value = connection?.apiUrl ?? "";
  const configs = settings.value.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
  const key = provider && configs?.[provider.id]?.apiKey;
  apiKey.value = typeof key === "string" ? key : "";
  if (provider) {
    initialConfig.value = structuredClone(toRaw(configs?.[provider.id] ?? {}));
    formValues.value = structuredClone(toRaw(initialConfig.value));
  }
  imageProtocolId.value = provider?.imageProtocolId ?? "";
  models.value = (provider?.listedModels ?? []).map(model => ({ ...model }));
  selectedIds.value = models.value.map(model => model.id);
  formError.value = "";
}, { immediate: true });

watch([apiUrl, protocol], () => {
  activeRequest?.abort();
  models.value = adapter.value?.models.map(({ id, label }) => ({ id, label })) ?? [];
  selectedIds.value = [];
  formError.value = "";
}, { flush: "sync" });
watch(apiKey, () => activeRequest?.abort(), { flush: "sync" });
onBeforeUnmount(() => activeRequest?.abort());
onMounted(() => {
  void loadProtocols();
  if (props.provider?.modelConnection) void fetchModels();
});

async function loadProtocols() {
  try {
    const { data } = await axios.get<{ code: number; data: { protocols: ImageProtocol[] }; message?: string }>("/api/imageProtocols/list");
    if (data.code !== 200) throw new Error(data.message || "读取生图协议失败");
    imageProtocols.value = data.data.protocols;
  } catch (error) { formError.value = errorMessage(error); }
  finally { loadingProtocols.value = false; }
}

function setModelProtocol(model: MediaListedModel, value: string) {
  if (value === "__inherit") delete model.imageProtocolId;
  else model.imageProtocolId = value === "__none" ? "" : value;
}

function errorMessage(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "请求失败，请重试";
}

async function fetchModels() {
  if (busy.value || savedProvider.value || !apiUrl.value.trim()) return;
  fetching.value = true;
  formError.value = "";
  const request = new AbortController();
  activeRequest = request;
  try {
    const { data } = await axios.post<{ code: number; data: { id: string; label: string }[]; message?: string }>("/api/providers/media/discover", {
      apiUrl: apiUrl.value.trim(), protocol: protocol.value, apiKey: apiKey.value.trim(),
    }, { headers: { "x-toonflow-workspace": "1" }, signal: request.signal, timeout: 35000 });
    if (request.signal.aborted) return;
    if (data.code !== 200 || !Array.isArray(data.data)) throw new Error(data.message || "获取模型失败");
    if (!data.data.length) throw new Error("平台未返回模型，已有选择已保留");
    // ACT: 刷新保留已勾选的原始 ID；平台暂时漏报的模型由用户决定是否移除。
    const previous = new Map(models.value.map(model => [model.id, model]));
    models.value = [...new Map([...models.value.filter(model => selectedIds.value.includes(model.id)), ...data.data.map(model => ({ ...previous.get(model.id), id: model.id, label: model.label }))].map(model => [model.id, model])).values()];
  } catch (error) {
    if (!request.signal.aborted) formError.value = errorMessage(error);
  } finally {
    if (activeRequest === request) activeRequest = undefined;
    fetching.value = false;
  }
}

function toggleModel(id: string, selected: string | number | boolean) {
  selectedIds.value = selected ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter(value => value !== id);
}

function openAdapter() {
  if (busy.value || savedProvider.value) return;
  adapterDialog.value ??= defineAsyncComponent(() => import("./providerAdapterDialog.vue"));
  adapterVisible.value = true;
}

function useAdapter(source: string, provider: MediaProvider) {
  initialConfig.value = { ...toRaw(initialConfig.value), ...formApi.value?.formData() };
  adapterSource.value = source;
  importedAdapter.value = provider;
  // ACT: 不提供模型列表接口的平台仍可勾选文件中明确声明的模型，保留原有选择。
  models.value = [...new Map([...provider.models.map(({ id, label }) => ({ id, label })), ...models.value].map(model => [model.id, model])).values()];
  formApi.value = undefined;
  formError.value = "";
}

async function submit() {
  if (busy.value || !canSubmit.value) return;
  saving.value = true;
  formError.value = "";
  try {
    if (formRules.value.length && (!formApi.value || !(await formApi.value.validate().then(() => true, () => false)))) return;
    const config = formApi.value?.formData() ?? {};
    if (!savedProvider.value) {
      const { data } = await axios.post<{ code: number; data: MediaProvider; message?: string }>("/api/providers/media/configure", {
        label: label.value.trim(), modelConnection: { apiUrl: apiUrl.value.trim(), protocol: protocol.value }, imageProtocolId: imageProtocolId.value,
        listedModels: models.value.filter(model => selectedIds.value.includes(model.id)),
        ...(props.provider ? { fileName: props.provider.fileName, revision: props.provider.revision } : {}),
        ...(adapterSource.value === undefined ? {} : { adapterSource: adapterSource.value }),
      }, { headers: { "x-toonflow-workspace": "1" } });
      if (data.code !== 200 || !data.data) throw new Error(data.message || "保存供应商失败");
      savedProvider.value = data.data;
      emit("saved", data.data);
    }
    const providerId = savedProvider.value.id;
    // ACT: 文件已保存时重试只补存密钥，不重复创建供应商。
    await saveSettings(current => {
      const configs = current.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
      if (configs !== undefined && (!configs || typeof configs !== "object" || Array.isArray(configs))) throw new Error("媒体供应商配置格式无效");
      const previous = configs?.[providerId];
      if (previous !== undefined && (!previous || typeof previous !== "object" || Array.isArray(previous))) throw new Error("当前供应商配置格式无效");
      return { mediaProviderConfigs: { ...configs, [providerId]: { ...previous, ...config, apiKey: apiKey.value.trim().replace(/^Bearer(?:\s+|$)/i, "").trim() } } };
    });
    invalidateNodeModels("media");
    emit("completed");
  } catch (error) {
    formError.value = savedProvider.value ? `模型列表已保存，密钥保存失败：${errorMessage(error)}。请重试。` : errorMessage(error);
  } finally { saving.value = false; }
}

defineExpose({ busy, saving, canSubmit, submit, openAdapter });
</script>

<style lang="scss" scoped>
.customProviderForm {
  max-height: min(65dvh, calc(100dvh - 180px));
  overflow-y: auto;
  padding-right: 6px;
  .el-select { width: 100%; }

  .modelHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  .modelList {
    display: flex;
    flex-direction: column;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);

    .modelRow {
      padding: 8px 12px;
      & + .modelRow { border-top: 1px solid var(--el-border-color-lighter); }
      .el-select { margin: 4px 0; }
      .el-checkbox {
        height: auto;
        min-height: 44px;
        margin: 0;
        padding: 0;
        .el-tag { margin-left: 8px; }
        :deep(.el-checkbox__label) { white-space: normal; overflow-wrap: anywhere; min-width: 0; }
      }
    }
  }

  .modelHint { display: block; margin: 12px 0; }
  .adapterInfo { display: block; margin: 12px 0; }
}
</style>
