<template>
  <div class="protocolPanel" v-loading="loading">
    <p class="panelHint">在媒体模型中为供应商选择协议，即可按这里的配置调用生图接口。协议不包含供应商地址和 API Key。</p>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" showIcon>
      <el-button text @click="loadProtocols">重新加载</el-button>
    </el-alert>
    <div v-else class="protocolList">
      <el-card v-for="protocol in protocols" :key="protocol.id" class="protocolItem" shadow="never">
        <div class="protocolHeader">
          <strong>{{ protocol.label }}</strong>
          <el-tag size="small" type="info" effect="plain">{{ getProviderLabels(protocol.id).length }} 个供应商引用</el-tag>
        </div>
        <dl class="protocolPaths">
          <div><dt>文生图</dt><dd>{{ protocol.generationPath }}</dd></div>
          <div><dt>参考图</dt><dd>{{ protocol.editPath || '未启用' }}</dd></div>
        </dl>
        <div class="protocolFooter">
          <span class="usageText">{{ getProviderLabels(protocol.id).join('、') || '尚未被供应商使用' }}</span>
          <el-space :size="4" wrap>
            <el-button text :icon="IconEdit" :disabled="busy" @click="openEditor(protocol)">编辑</el-button>
            <el-button text :icon="IconCopy" :disabled="busy" @click="openEditor(protocol, true)">复制</el-button>
            <el-button text type="danger" :icon="IconTrash" :loading="deletingId === protocol.id" :disabled="busy" @click="deleteProtocol(protocol)">删除</el-button>
          </el-space>
        </div>
      </el-card>
    </div>
    <el-button class="addButton" :icon="IconPlus" :disabled="busy || !!loadError" @click="openEditor()">新增生图协议</el-button>
    <el-dialog
      v-model="editorVisible"
      :title="editingId ? '编辑生图协议' : '新增生图协议'"
      width="min(740px, 94vw)"
      alignCenter
      appendToBody
      destroyOnClose
      :closeOnClickModal="false"
      :closeOnPressEscape="!saving"
      :showClose="!saving">
      <el-scrollbar maxHeight="min(65dvh, calc(100dvh - 170px))">
        <div class="editorContent">
          <el-alert v-if="editingProviderLabels.length" class="usageNotice" type="warning" :closable="false" showIcon :title="`保存后会影响：${editingProviderLabels.join('、')}`" />
          <el-form labelPosition="top" :disabled="saving" @submit.prevent="saveProtocol">
            <el-form-item label="协议名称" required>
              <el-input v-model="draft.label" :maxlength="100" placeholder="例如：OpenAI 兼容生图" aria-label="协议名称" />
            </el-form-item>
            <el-form-item label="文生图接口路径" required>
              <el-input v-model="draft.generationPath" placeholder="/v1/images/generations" aria-label="文生图接口路径" />
              <p class="fieldHint">与供应商的 API 地址拼接，重复路径段自动合并。请求方式为 POST。</p>
            </el-form-item>
            <el-form-item label="参考图接口路径">
              <el-input v-model="draft.editPath" placeholder="留空则不启用图生图" aria-label="参考图接口路径" />
              <p class="fieldHint">支持 <code v-pre>{{model}}</code> 和 <code v-pre>{{modelName}}</code>；后者会移除 Gemini 模型 ID 的 models/ 前缀。</p>
            </el-form-item>
            <div v-if="draft.editPath.trim()" class="fieldRow">
              <el-form-item label="参考图请求格式">
                <el-select v-model="draft.editEncoding" aria-label="参考图请求格式">
                  <el-option label="JSON" value="json" />
                  <el-option label="表单文件（multipart）" value="multipart" />
                </el-select>
              </el-form-item>
              <el-form-item v-if="draft.editEncoding === 'multipart'" label="图片文件字段" required>
                <el-input v-model="draft.imageField" placeholder="image" aria-label="图片文件字段" />
              </el-form-item>
            </div>
            <el-collapse v-model="expandedSections" class="advancedSections">
              <el-collapse-item title="鉴权配置" name="auth">
                <div class="fieldRow">
                  <el-form-item label="API Key 请求头">
                    <el-input v-model="draft.authHeader" placeholder="Authorization" aria-label="API Key 请求头" />
                  </el-form-item>
                  <el-form-item label="API Key 前缀">
                    <el-input v-model="draft.authPrefix" placeholder="Bearer 后需保留一个空格" aria-label="API Key 前缀" />
                  </el-form-item>
                </div>
                <p class="fieldHint">运行时读取供应商的 API Key；前缀按原样拼接。请求头留空表示不发送鉴权。</p>
              </el-collapse-item>
              <el-collapse-item title="请求模板" name="body">
                <p class="fieldHint">模板必须是 JSON 对象。完整占位符保留数组、数字等原始类型；未提供的参数会省略。</p>
                <p class="fieldHint" v-pre>可用：{{model}}、{{prompt}}、{{size}}、{{ratio}}、{{n}}、{{quality}}、{{outputFormat}}、{{images}}、{{parts}}。</p>
                <p class="fieldHint">images 为参考图 data URL 数组，parts 为 Gemini 文本和 inlineData 数组。表单文件由“图片文件字段”单独提交。</p>
                <el-form-item label="文生图请求模板（JSON）" required>
                  <el-input v-model="generationBodyText" class="jsonInput" type="textarea" :rows="8" spellcheck="false" aria-label="文生图请求模板 JSON" />
                </el-form-item>
                <el-form-item label="参考图请求模板（JSON）" required>
                  <el-input v-model="editBodyText" class="jsonInput" type="textarea" :rows="8" spellcheck="false" aria-label="参考图请求模板 JSON" />
                </el-form-item>
              </el-collapse-item>
              <el-collapse-item title="结果读取" name="response">
                <p class="fieldHint">使用点分隔的字段路径，例如 data、candidates.0.content.parts；* 可遍历数组，例如 candidates.*.content.parts.*。数组路径留空表示响应本身就是图片数组；结果项中的路径也支持数组下标。</p>
                <el-form-item label="图片数组路径">
                  <el-input v-model="draft.response.itemsPath" placeholder="data" aria-label="图片数组路径" />
                </el-form-item>
                <div class="fieldRow">
                  <el-form-item label="图片 URL 路径">
                    <el-input v-model="draft.response.urlPath" placeholder="url" aria-label="图片 URL 路径" />
                  </el-form-item>
                  <el-form-item label="图片 Base64 路径">
                    <el-input v-model="draft.response.base64Path" placeholder="b64_json" aria-label="图片 Base64 路径" />
                  </el-form-item>
                </div>
                <div class="fieldRow">
                  <el-form-item label="MIME 类型路径">
                    <el-input v-model="draft.response.mimeTypePath" placeholder="可留空" aria-label="MIME 类型路径" />
                  </el-form-item>
                  <el-form-item label="默认 MIME 类型" required>
                    <el-input v-model="draft.response.mimeType" placeholder="image/png" aria-label="默认 MIME 类型" />
                  </el-form-item>
                </div>
              </el-collapse-item>
              <el-collapse-item title="尺寸与比例" name="sizes">
                <el-form-item label="尺寸选项">
                  <el-input v-model="imageSizesText" placeholder="例如：1K, 2K, 4K" aria-label="尺寸选项" />
                  <p class="fieldHint">多个选项用逗号或换行分隔，至少填写一项。只填写上游接口支持的尺寸。</p>
                </el-form-item>
                <el-form-item label="比例选项">
                  <el-input v-model="imageRatiosText" placeholder="例如：1:1, 16:9, 9:16" aria-label="比例选项" />
                </el-form-item>
                <el-form-item label="尺寸映射（JSON）">
                  <el-input v-model="sizeMapText" class="jsonInput" type="textarea" :rows="7" spellcheck="false" aria-label="尺寸映射 JSON" />
                  <p class="fieldHint">格式：尺寸档位 → 比例 → 接口像素值，例如 { "1K": { "1:1": "1024x1024", "*": "auto" } }。* 为其他比例的默认值；空字符串不发送 size；未配置映射时直接发送尺寸选项。</p>
                </el-form-item>
              </el-collapse-item>
            </el-collapse>
          </el-form>
          <el-alert v-if="formError" class="formError" :title="formError" type="error" :closable="false" showIcon />
        </div>
      </el-scrollbar>
      <template #footer>
        <el-button :disabled="saving" @click="editorVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveProtocol">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, onBeforeUnmount, ref, toRaw, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconCopy, IconEdit, IconPlus, IconTrash } from "@tabler/icons-vue";
import { defaultImageProtocols, type ImageProtocol } from "@toonflow/providers/imageProtocols";
import { saveSettings } from "@/stores/settings";

type ProtocolUsage = { protocolId: string; providerId: string; providerLabel: string; modelId?: string };
type ProtocolList = { protocols: ImageProtocol[]; usages: ProtocolUsage[] };

const { visible = true } = defineProps<{ visible?: boolean }>();
const protocols = ref<ImageProtocol[]>([]);
const usages = ref<ProtocolUsage[]>([]);
const loading = ref(false);
const loadError = ref("");
const editorVisible = ref(false);
const editingId = ref("");
const deletingId = ref("");
const saving = ref(false);
const busy = computed(() => loading.value || saving.value || !!deletingId.value);
const draft = ref(createDraft());
const generationBodyText = ref("");
const editBodyText = ref("");
const imageSizesText = ref("");
const imageRatiosText = ref("");
const sizeMapText = ref("");
const expandedSections = ref<string[]>([]);
const formError = ref("");
const editingProviderLabels = computed(() => getProviderLabels(editingId.value));
let editingSnapshot = "";
let loadRequest = 0;

watch(() => visible, value => { if (value) void loadProtocols(); }, { immediate: true });
onBeforeUnmount(() => { loadRequest++; });

function createDraft() {
  return { ...structuredClone(defaultImageProtocols[0]!), id: `image${crypto.randomUUID().replaceAll("-", "")}`, label: "" };
}

function getProviderLabels(protocolId: string, references = usages.value) {
  return [...new Map(references.filter(item => item.protocolId === protocolId).map(item => [item.providerId, item.providerLabel])).values()];
}

function errorMessage(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "操作失败，请重试";
}

async function readProtocols() {
  const { data } = await axios.get<{ code: number; data: ProtocolList; message: string }>("/api/imageProtocols/list", { headers: { "x-toonflow-workspace": "1", "Cache-Control": "no-cache" } });
  if (data.code !== 200 || !data.data) throw new Error(data.message || "读取生图协议失败");
  return data.data;
}

async function loadProtocols() {
  const request = ++loadRequest;
  loading.value = true;
  loadError.value = "";
  try {
    const data = await readProtocols();
    if (request !== loadRequest) return;
    protocols.value = data.protocols;
    usages.value = data.usages;
  } catch (error) {
    if (request === loadRequest) loadError.value = errorMessage(error);
  } finally {
    if (request === loadRequest) loading.value = false;
  }
}

function openEditor(protocol?: ImageProtocol, copy = false) {
  if (busy.value) return;
  editingId.value = protocol && !copy ? protocol.id : "";
  editingSnapshot = protocol && !copy ? JSON.stringify(protocol) : "";
  draft.value = protocol ? structuredClone(toRaw(protocol)) : createDraft();
  if (protocol && copy) {
    draft.value.id = `image${crypto.randomUUID().replaceAll("-", "")}`;
    draft.value.label = `${protocol.label} 副本`;
  }
  generationBodyText.value = JSON.stringify(draft.value.generationBody, null, 2);
  editBodyText.value = JSON.stringify(draft.value.editBody, null, 2);
  imageSizesText.value = draft.value.imageSizes.join(", ");
  imageRatiosText.value = draft.value.imageRatios.join(", ");
  sizeMapText.value = JSON.stringify(draft.value.sizeMap, null, 2);
  expandedSections.value = [];
  formError.value = "";
  editorVisible.value = true;
}

function parseObject(text: string, label: string): ImageProtocol["generationBody"] {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${label}必须是有效 JSON`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}必须是 JSON 对象`);
  return Object.fromEntries(Object.entries(value));
}

function parseOptions(text: string) {
  return [...new Set(text.split(/[,，\n]/).map(item => item.trim()).filter(Boolean))];
}

function parseDraft(): ImageProtocol {
  const protocol = structuredClone(toRaw(draft.value));
  protocol.label = protocol.label.trim();
  protocol.generationPath = protocol.generationPath.trim();
  protocol.editPath = protocol.editPath.trim();
  protocol.authHeader = protocol.authHeader.trim();
  protocol.imageField = protocol.imageField.trim();
  if (!protocol.label) throw new Error("请填写协议名称");
  if (!protocol.generationPath) throw new Error("请填写文生图接口路径");
  if (protocol.editPath && protocol.editEncoding === "multipart" && !protocol.imageField) throw new Error("请填写图片文件字段");
  protocol.generationBody = parseObject(generationBodyText.value, "文生图请求模板");
  protocol.editBody = parseObject(editBodyText.value, "参考图请求模板");
  protocol.imageSizes = parseOptions(imageSizesText.value);
  protocol.imageRatios = parseOptions(imageRatiosText.value);
  if (!protocol.imageSizes.length || !protocol.imageRatios.length) throw new Error("尺寸和比例至少各填写一项");
  const sizeMap = parseObject(sizeMapText.value, "尺寸映射");
  protocol.sizeMap = Object.fromEntries(Object.entries(sizeMap).map(([size, ratios]) => {
    if (!ratios || typeof ratios !== "object" || Array.isArray(ratios)) throw new Error(`尺寸映射 ${size} 必须是比例对象`);
    const entries = Object.entries(ratios);
    const values: Record<string, string> = {};
    for (const [ratio, pixels] of entries) {
      if (typeof pixels !== "string") throw new Error(`尺寸映射 ${size} 的 ${ratio} 必须是字符串`);
      values[ratio] = pixels;
    }
    return [size, values];
  }));
  return protocol;
}

async function saveProtocol() {
  if (saving.value) return;
  formError.value = "";
  saving.value = true;
  try {
    const protocol = parseDraft();
    const latest = await readProtocols();
    usages.value = latest.usages;
    const index = latest.protocols.findIndex(item => item.id === editingId.value);
    if (editingId.value && (index < 0 || JSON.stringify(latest.protocols[index]) !== editingSnapshot)) {
      throw new Error("该协议已被修改或删除。当前草稿已保留，请重新打开协议后编辑。");
    }
    const providerLabels = getProviderLabels(editingId.value, latest.usages);
    if (providerLabels.length) {
      const confirmed = await ElMessageBox.confirm(`保存后，${providerLabels.join('、')} 将使用新的生图协议。确认保存？`, "确认协议变更", {
        type: "warning", confirmButtonText: "确认保存", cancelButtonText: "继续编辑",
      }).then(() => true, () => false);
      if (!confirmed) return;
    }
    const nextProtocols = [...latest.protocols];
    if (editingId.value) nextProtocols.splice(index, 1, protocol);
    else nextProtocols.push(protocol);
    await saveSettings(() => ({ imageProtocols: nextProtocols }));
    protocols.value = nextProtocols;
    editorVisible.value = false;
    ElMessage.success("生图协议已保存");
    await loadProtocols();
  } catch (error) {
    formError.value = errorMessage(error);
  } finally { saving.value = false; }
}

async function deleteProtocol(protocol: ImageProtocol) {
  if (busy.value) return;
  deletingId.value = protocol.id;
  try {
    const latest = await readProtocols();
    usages.value = latest.usages;
    const providerLabels = getProviderLabels(protocol.id, latest.usages);
    if (providerLabels.length) {
      ElMessage.warning(`请先在媒体模型中修改以下供应商的生图协议：${providerLabels.join('、')}`);
      return;
    }
    const confirmed = await ElMessageBox.confirm(`确定删除“${protocol.label}”？`, "删除生图协议", {
      type: "warning", confirmButtonText: "删除", cancelButtonText: "取消",
    }).then(() => true, () => false);
    if (!confirmed) return;
    const nextProtocols = latest.protocols.filter(item => item.id !== protocol.id);
    await saveSettings(() => ({ imageProtocols: nextProtocols }));
    protocols.value = nextProtocols;
    ElMessage.success("生图协议已删除");
    await loadProtocols();
  } catch (error) { ElMessage.error(errorMessage(error)); }
  finally { deletingId.value = ""; }
}
</script>

<style lang="scss" scoped>
.protocolPanel {
  .panelHint {
    margin: 0 0 20px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.7;
  }

  .protocolList {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .protocolItem {
      .protocolHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;

        strong { overflow-wrap: anywhere; }
      }

      .protocolPaths {
        display: grid;
        gap: 8px;
        margin: 18px 0;
        font-size: 13px;

        > div {
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr);
          gap: 12px;

          dt { color: var(--el-text-color-secondary); }
          dd { margin: 0; overflow-wrap: anywhere; }
        }
      }

      .protocolFooter {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;

        .usageText {
          color: var(--el-text-color-secondary);
          font-size: 12px;
          overflow-wrap: anywhere;
        }
      }
    }
  }

  .addButton { width: 100%; margin-top: 16px; }
}

.editorContent {
  padding: 0 10px 2px 0;

  .usageNotice { margin-bottom: 20px; }

  .fieldHint {
    width: 100%;
    margin: 6px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .fieldRow {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .advancedSections {
    margin-top: 8px;

    .fieldHint { margin-bottom: 12px; }
    :deep(.el-collapse-item__content) { padding: 8px 0 6px; }
    .jsonInput :deep(textarea) { font-family: monospace; font-size: 12px; line-height: 1.6; }
  }

  .formError { margin-top: 16px; }

  @media (max-width: 600px) {
    .fieldRow { grid-template-columns: minmax(0, 1fr); gap: 0; }
  }
}
</style>
