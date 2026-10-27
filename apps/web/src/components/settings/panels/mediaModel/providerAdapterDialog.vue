<template>
  <el-dialog v-model="visible" title="导入供应商适配文件" width="min(760px, 94vw)" alignCenter appendToBody destroyOnClose :closeOnClickModal="false" :closeOnPressEscape="!saving" :showClose="!saving">
    <el-scrollbar maxHeight="min(65dvh, calc(100dvh - 160px))">
      <div class="dialogContent">
        <el-form class="importForm" labelPosition="top" :disabled="saving" @submit.prevent>
          <el-form-item class="methodField" label="添加方式">
            <el-segmented v-model="activeTab" :options="addMethods" block ariaLabel="添加方式">
              <template #default="{ item }">
                <span class="methodOption">
                  <component :is="item.icon" :size="16" aria-hidden="true" />
                  {{ item.label }}
                </span>
              </template>
            </el-segmented>
          </el-form-item>
          <el-form-item v-if="activeTab === 'file'" class="sourceField" label="供应商文件">
            <div class="fileImport">
              <div class="fileSource">
                <!-- ACT: Android 会把 .ts 识别为视频，选中后再校验扩展名和大小。 -->
                <input ref="fileInput" type="file" :accept="actualPlatform.isMobile ? undefined : '.ts'" hidden :disabled="saving" @change="readSourceFile" />
                <el-input :modelValue="fileName" :prefixIcon="IconFileCode" placeholder="尚未选择文件" readonly aria-label="已选择的供应商文件" />
                <el-button :icon="IconFolderOpen" @click="fileInput?.click()">选择文件</el-button>
              </div>
              <el-text class="fieldHint" type="info" size="small">支持 .ts 文件，最大 1 MB。</el-text>
            </div>
          </el-form-item>
          <el-form-item v-else class="sourceField" label="供应商代码">
            <el-input v-model="code" class="sourceInput" type="textarea" dir="ltr" :rows="10" resize="none" aria-label="供应商代码" />
          </el-form-item>
        </el-form>
        <section class="providerTips" aria-label="使用 AI 生成供应商">
          <h4>还没有供应商文件？</h4>
          <p>让 AI 读取接口文档并生成代码，遇到登录可手动操作。</p>
          <div class="assistantActions">
            <el-button type="primary" :icon="IconSparkles" :loading="openingAgent" :disabled="!modelChoices.length || saving" @click="openAgent">AI 生成供应商</el-button>
            <el-button :icon="IconCopy" @click="copyPrompt">复制提示词给其他 AI</el-button>
          </div>
          <el-text v-if="!modelChoices.length" class="fieldHint" type="info" size="small">请先在文本模型设置中配置模型。</el-text>
          <details class="promptDetails" :open="promptExpanded" @toggle="promptExpanded = ($event.target as HTMLDetailsElement).open">
            <summary>查看完整提示词</summary>
            <el-input v-if="promptExpanded" :modelValue="providerPrompt" type="textarea" :rows="10" resize="none" readonly aria-label="供应商开发提示词" />
          </details>
        </section>
        <el-alert v-if="formError" class="formError" :title="formError" type="error" :closable="false" showIcon />
      </div>
    </el-scrollbar>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!source.trim()" @click="confirmSource">使用此适配文件</el-button>
    </template>
  </el-dialog>
  <component v-if="providerAgentDialog" :is="providerAgentDialog" v-model="agentVisible" :askUserEnabled="askUserEnabled" @generated="useGeneratedSource" />
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch, type Component } from "vue";
import { IconFileCode, IconCode, IconFolderOpen, IconCopy, IconSparkles } from "@tabler/icons-vue";
import { ElMessage } from "element-plus";
import { modelChoices } from "@/stores/settings";
import { writeClipboardText } from "@/lib/clipboard";
import { actualPlatform } from "@/lib/platform";
import { providerPrompt } from "./providerPrompt";
import type { MediaProvider } from "./types";

const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ confirmed: [source: string, provider: MediaProvider] }>();
const activeTab = ref<"file" | "code">("file");
const addMethods = [
  { label: "文件导入", value: "file", icon: IconFileCode },
  { label: "粘贴代码", value: "code", icon: IconCode },
];
const promptExpanded = ref(false);
const code = ref("");
const fileSource = ref("");
const fileName = ref("");
const fileInput = ref<HTMLInputElement>();
const saving = ref(false);
const formError = ref("");
const openingAgent = ref(false);
const agentVisible = ref(false);
const askUserEnabled = ref(false);
const providerAgentDialog = shallowRef<Component>();
let agentOpening: AbortController | undefined;
const source = computed(() => activeTab.value === "file" ? fileSource.value : code.value);

watch(visible, value => {
  agentOpening?.abort();
  openingAgent.value = false;
  if (!value) { agentVisible.value = false; return; }
  activeTab.value = "file";
  promptExpanded.value = false;
  code.value = fileSource.value = fileName.value = formError.value = "";
});

async function openAgent() {
  if (openingAgent.value || saving.value || !modelChoices.value.length) return;
  openingAgent.value = true;
  formError.value = "";
  const controller = new AbortController();
  agentOpening = controller;
  try {
    const { data } = await axios.get<{ data: { tools: { name: string; enabled: boolean; loadError?: string }[] } }>("/api/tools/get", { signal: controller.signal });
    if (controller.signal.aborted || !visible.value) return;
    const browser = data.data.tools.find(tool => tool.name === "browser");
    if (!browser?.enabled) throw new Error("请先在「工具市场」安装并启用网页浏览器工具");
    if (browser.loadError) throw new Error(`浏览器工具加载失败：${browser.loadError}`);
    askUserEnabled.value = data.data.tools.some(tool => tool.name === "askUser" && tool.enabled && !tool.loadError);
    providerAgentDialog.value ??= defineAsyncComponent(() => import("./providerAgentDialog.vue"));
    agentVisible.value = true;
  } catch (error) {
    if (controller.signal.aborted) return;
    formError.value = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "打开生成助手失败";
  } finally { if (agentOpening === controller) { agentOpening = undefined; openingAgent.value = false; } }
}

onBeforeUnmount(() => agentOpening?.abort());

function useGeneratedSource(source: string) {
  activeTab.value = "code";
  code.value = source;
  formError.value = "";
}

async function readSourceFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  formError.value = "";
  try {
    if (!/\.ts$/i.test(file.name) || file.size > 1024 * 1024) throw new Error("请选择不超过 1 MB 的 .ts 文件");
    fileSource.value = await file.text();
    fileName.value = file.name;
  } catch (error) {
    fileSource.value = fileName.value = "";
    formError.value = error instanceof Error ? error.message : "读取文件失败";
  }
}

async function confirmSource() {
  if (saving.value || !source.value.trim()) return;
  saving.value = true;
  formError.value = "";
  try {
    if (new TextEncoder().encode(source.value).byteLength > 1024 * 1024) throw new Error("供应商文件不能超过 1 MB");
    const { data } = await axios.post<{ code: number; data: MediaProvider; message?: string }>("/api/providers/media/validate", { source: source.value }, { headers: { "x-toonflow-workspace": "1" } });
    if (data.code !== 200 || !data.data) throw new Error(data.message || "读取适配文件失败");
    if (data.data.modelConnection) throw new Error("请选择包含生成逻辑的供应商文件");
    const models = data.data.models.filter(model => data.data.generationTypes?.includes(model.type));
    if (!models.length) throw new Error("适配文件未声明可执行的图片、视频或音频模型");
    emit("confirmed", source.value, { ...data.data, models });
    visible.value = false;
  } catch (error) {
    formError.value = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "读取适配文件失败";
  } finally { saving.value = false; }
}

async function copyPrompt() {
  try {
    await writeClipboardText(providerPrompt);
    ElMessage.success("提示词已复制，发给其他 AI 后跟着回答问题即可");
  } catch {
    ElMessage.error("复制失败，请展开「查看完整提示词」后手动复制");
  }
}
</script>

<style lang="scss" scoped>
.dialogContent {
  padding: 8px 4px;

  .importForm {
    .methodField {
      .methodOption {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 4px 0;
      }
    }

    .sourceField {
      margin-bottom: 0;

      .fileImport {
        width: 100%;

        .fileSource {
          display: flex;
          width: 100%;
          gap: 8px;

          .el-input { min-width: 0; }
          .el-button { flex-shrink: 0; }
        }

        .fieldHint {
          display: block;
          margin-top: 6px;
          line-height: 1.5;
        }
      }

      .sourceInput :deep(.el-textarea__inner) {
        height: min(28dvh, 240px);
        min-height: 140px;
        padding: 12px;
        font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
        font-size: 13px;
        line-height: 1.7;
      }
    }
  }

  .providerTips {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--el-border-color-lighter);

    h4 {
      margin: 0;
      color: var(--el-text-color-primary);
    }

    p {
      margin: 8px 0 12px;
      color: var(--el-text-color-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .assistantActions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;

      .el-button { margin-left: 0; }
    }

    .fieldHint {
      display: block;
      margin-top: 8px;
      line-height: 1.5;
    }

    .promptDetails {
      margin-top: 12px;

      summary {
        width: fit-content;
        color: var(--el-text-color-secondary);
        font-size: 12px;
        line-height: 20px;
        cursor: pointer;

        &:hover { color: var(--el-color-primary); }
        &:focus-visible {
          outline: 2px solid var(--el-color-primary);
          outline-offset: 4px;
          border-radius: var(--el-border-radius-small);
        }
      }

      .el-textarea {
        margin-top: 12px;

        :deep(.el-textarea__inner) {
          padding: 12px;
          font-size: 12px;
          line-height: 1.7;
        }
      }
    }
  }

  .formError {
    margin-top: 16px;
  }

  @media (max-width: 560px) {
    .importForm .sourceField .fileImport .fileSource {
      flex-direction: column;

      .el-button { align-self: flex-start; }
    }

    .providerTips .assistantActions {
      .el-button { flex: 1 1 180px; }
    }
  }
}
</style>
