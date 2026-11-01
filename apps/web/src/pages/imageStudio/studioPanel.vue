<template>
  <workbenchLayout class="studioPanel" type="image" :count="activeFiles.length" :historyCount="history.records.length" :empty="!activeRecord" :loading="!history.loaded && !history.error">
    <template #history>
      <historyList :records="history.records" type="image" :directory="directory" :activeId="activeRecord?.id" :error="history.error" @select="selectRecord" @remove="removeHistory" />
    </template>

    <template #settings>
      <div class="fieldLabel">提示词<promptLibrary type="image" :disabled="importing" @select="usePrompt">提示词库</promptLibrary></div>
      <el-input v-model="prompt" class="promptInput" type="textarea" :autosize="{ minRows: 5, maxRows: 14 }" placeholder="描述你想要的画面，例如：清晨薄雾中的江南小镇，石桥与乌篷船，电影感光影；有参考图时可写“参考图1的人物”" aria-label="提示词" />

      <template v-if="referenceLimit">
        <div class="fieldLabel">参考图<span class="fieldHint">{{ references.length }}/{{ referenceLimit }}</span></div>
        <referenceList v-model="references" :directory="directory" :kinds="['image']" :limits="{ image: referenceLimit }" />
      </template>

      <div class="fieldLabel">模型</div>
      <el-select
        v-model="form.model"
        filterable
        :loading="modelsLoading"
        placeholder="选择模型"
        aria-label="生成模型"
        noDataText="暂无可用的图片模型">
        <template #prefix><modelOption v-if="selectedModel" :model="selectedModel" iconOnly :size="17" /></template>
        <el-option-group v-for="provider in modelGroups" :key="provider.id" :label="provider.label">
          <el-option v-for="item in provider.models" :key="item.modelId" :label="item.label" :value="JSON.stringify([item.providerId, item.modelId])">
            <modelOption :model="item" />
          </el-option>
        </el-option-group>
      </el-select>

      <template v-if="selectedModel">
        <div class="fieldLabel">质量<span class="fieldHint">取决于模型是否支持</span></div>
        <el-segmented v-model="quality" :options="qualityOptions" block aria-label="图片质量" />
        <div class="fieldLabel">分辨率<span v-if="pixelSize" class="fieldHint">输出 {{ pixelSize }}</span></div>
        <el-segmented v-model="size" class="sizeSegmented" :options="sizeChoices" block aria-label="图片分辨率" />
        <div class="fieldLabel">比例<span v-if="size === 'auto'" class="fieldHint">分辨率为自动时由模型决定</span></div>
        <ratioPicker v-model="ratio" :options="ratioChoices" :disabled="size === 'auto'" label="图片比例" />
        <div class="switchOption">
          <span class="switchText">透明背景<span class="fieldHint">生成无背景的透明图，仅部分模型可用</span></span>
          <el-switch v-model="transparent" aria-label="透明背景" />
        </div>
        <div class="fieldLabel">数量<span class="fieldHint">每张单独生成、单独计费</span></div>
        <div class="countPicker">
          <el-segmented v-model="count" :options="countOptions" block aria-label="生成数量" />
          <el-input-number v-model="count" :min="1" :max="maxCount" :precision="0" controlsPosition="right" size="small" aria-label="自定义生成数量" />
        </div>
        <modelForm v-model="form.other" :rules="selectedModel.rules" />
      </template>
    </template>

    <template #actions>
      <div class="priceRow">
        <span>预估费用{{ count > 1 ? `（单张，共 ${count} 张）` : "" }}</span>
        <mediaPrice v-if="generationInput" :input="{ ...generationInput, mediaType: 'image' }" :supported="selectedModel?.supportsPrice === true" />
      </div>
      <el-button class="generateButton" type="primary" size="large" :icon="IconSparkles" :loading="submitting || importing" :disabled="!generationInput?.prompt || !history.loaded || importing" @click="startGeneration">
        生成 {{ count }} 张图片
      </el-button>
    </template>

    <template #resultExtra>
      <template v-if="activeRecord">
        <span v-if="activePending" class="generatingTag" role="status"><el-icon class="is-loading"><icon-loader-2 /></el-icon>生成中 {{ activeRecord.items.length - activePending }}/{{ activeRecord.items.length }}</span>
        <el-button size="small" round :icon="IconArrowBackUp" @click="fillRecord(activeRecord)">回填参数</el-button>
      </template>
    </template>

    <template #results>
      <template v-if="activeRecord">
        <p class="recordPrompt">{{ activeRecord.prompt }}</p>
        <div class="resultGrid">
          <template v-for="(item, index) in activeRecord.items" :key="index">
            <div v-if="item.status === 'pending'" class="pendingCard" aria-label="正在生成">
              <span class="pendingShine" aria-hidden="true" />
              <el-icon class="is-loading" :size="26"><icon-loader-2 /></el-icon>
              <span class="pendingText">{{ item.taskId ? "正在绘制…" : "正在提交…" }}</span>
            </div>
            <div v-else-if="item.status === 'failed'" class="pendingCard failedCard" role="alert">
              <icon-alert-circle :size="26" aria-hidden="true" />
              <span class="pendingText">生成失败</span>
              <span class="pendingPrompt">{{ item.error }}</span>
              <el-button size="small" round :icon="IconRefresh" @click="retry(activeRecord, item)">重试</el-button>
            </div>
            <resultCard
              v-for="path in item.files"
              v-else
              :key="path"
              :directory="directory"
              :path="path"
              @preview="preview = { url: $event, name: path.split('/').at(-1) }"
              @reference="addReference(path)" />
          </template>
        </div>
      </template>
      <mediaPreview :modelValue="!!preview" :items="preview ? [{ ...preview, type: 'image' }] : []" @update:modelValue="!$event && (preview = undefined)" />
    </template>
  </workbenchLayout>
</template>

<script setup lang="ts">
import { computed, provide, ref, shallowRef, watch } from "vue";
import { ElButton, ElIcon, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElOption, ElOptionGroup, ElSegmented, ElSelect, ElSwitch } from "element-plus";
import { IconAlertCircle, IconArrowBackUp, IconLoader2, IconRefresh, IconSparkles } from "@tabler/icons-vue";
import { useNodeAi, type NodeImageRequest, type NodeMediaModel } from "@toonflow/nodes-scaffold/nodeAi";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import { pickModel } from "@toonflow/node-shared/pickModel";
import { useModelForm } from "@toonflow/node-shared/useModelForm";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import modelForm from "@toonflow/node-shared/modelForm";
import modelOption from "@toonflow/node-shared/modelOption";
import mediaPrice from "@toonflow/node-shared/mediaPrice";
import mediaPreview from "@toonflow/node-shared/mediaPreview";
import promptLibrary from "@toonflow/node-shared/promptLibrary";
import workbenchLayout from "@/components/workbenchLayout.vue";
import historyList from "@/components/historyList.vue";
import referenceList, { type ReferenceFile } from "@/components/referenceList.vue";
import ratioPicker from "@/components/ratioPicker.vue";
import { outputDirectory, removeRecord, retryItem, submitRecord, useHistory, type HistoryItem, type HistoryRecord } from "@/stores/workbenchHistory";
import { imageMimeType, importReferenceImages } from "./studioFiles";
import resultCard from "./resultCard.vue";

const props = defineProps<{ directory: string }>();
// ACT: 网关单次最多 16 张参考图；模型 meta 没有单独的图片参考上限字段，按 mode 区分单图/多图。
const maxReferences = 16;
// ACT: 每张是一个独立任务并发提交，自定义数量上限 20，避免一次误填提交过多任务。
const maxCount = 20;
const countOptions = Array.from({ length: 10 }, (_item, index) => ({ label: `${index + 1}`, value: index + 1 }));
const qualityOptions = [{ label: "自动", value: "auto" }, { label: "高", value: "high" }, { label: "中", value: "medium" }, { label: "低", value: "low" }];
const ai = useNodeAi();
const models = shallowRef<NodeMediaModel[]>([]);
const modelsLoading = ref(false);
const form = ref<{ model: string; other: Record<string, unknown> }>({ model: "", other: {} });
const size = ref("");
const ratio = ref("");
const prompt = ref("");
const count = ref(1);
const quality = ref("auto");
const transparent = ref(false);
const references = ref<ReferenceFile[]>([]);
const submitting = ref(false);
const importing = ref(false);
const activeId = ref<string>();
const preview = ref<{ url: string; name?: string }>();
const history = computed(() => useHistory("image", props.directory));
const activeRecord = computed(() => history.value.records.find(item => item.id === activeId.value) ?? history.value.records[0]);
const activeFiles = computed(() => activeRecord.value?.items.flatMap(item => item.files) ?? []);
const activePending = computed(() => activeRecord.value?.items.filter(item => item.status === "pending").length ?? 0);
const selectedModel = computed(() => models.value.find(item => JSON.stringify([item.providerId, item.modelId]) === form.value.model));
const modelGroups = computed(() => groupNodeModels(models.value));
const sizeOptions = computed(() => selectedModel.value?.imageSizes?.length ? selectedModel.value.imageSizes : ["2K"]);
const ratioOptions = computed(() => selectedModel.value?.imageRatios?.length ? selectedModel.value.imageRatios : ["16:9"]);
// “自动”不传分辨率或比例，由上游决定；云端只在有分辨率档位时按比例换算像素，所以分辨率自动时比例也一并自动。
const sizeChoices = computed(() => [...sizeOptions.value, { label: "自动", value: "auto" }]);
const ratioChoices = computed(() => [...ratioOptions.value, "auto"]);
const pixelSize = computed(() => selectedModel.value?.sizeMap?.[size.value]?.[ratio.value]?.replace("x", " × "));
// 模型声明 multiReference 时可传多张参考图，只有 singleImage 时限 1 张，未声明则不显示参考图。
const referenceLimit = computed(() => {
  const modes = selectedModel.value?.mode ?? ["text", "singleImage", "multiReference"];
  return modes.includes("multiReference") ? maxReferences : modes.includes("singleImage") ? 1 : 0;
});
const usedReferences = computed(() => references.value.slice(0, referenceLimit.value));
const generationInput = computed<Omit<NodeImageRequest, "directory"> | undefined>(() => {
  const choice = selectedModel.value;
  if (!choice) return;
  const text = prompt.value.trim();
  // 多张参考图时在提示词前说明编号，让模型能对应“图1”“图2”的引用。
  const prefix = usedReferences.value.length > 1 ? `参考图片编号：${usedReferences.value.map((_item, index) => `图${index + 1}`).join("、")}。请按这些编号理解提示词中的图片引用。\n` : "";
  // 质量与透明背景按 OpenAI 图片接口的字段放进 other，由云端原样转发；“自动”与不透明时不传。
  const other = {
    ...form.value.other,
    ...quality.value === "auto" ? {} : { quality: quality.value },
    ...transparent.value ? { background: "transparent" } : {},
  };
  return {
    providerId: choice.providerId,
    modelId: choice.modelId,
    prompt: text && prefix + text,
    size: size.value === "auto" ? undefined : size.value,
    ratio: size.value === "auto" || ratio.value === "auto" ? undefined : ratio.value,
    other: Object.keys(other).length ? other : undefined,
    outputDirectory,
    images: usedReferences.value.length ? usedReferences.value.map(item => ({ ...item })) : undefined,
  };
});

// mediaPrice 通过注入读取工作目录估价。
provide("workspaceDirectory", () => props.directory);
useModelForm(form, selectedModel);

watch(selectedModel, choice => {
  if (!choice) return;
  // ACT: 与图片生成节点一致，分辨率默认取数值最小的一档，比例优先 16:9。
  if (size.value !== "auto" && !sizeOptions.value.includes(size.value)) size.value = sizeOptions.value.toSorted((left, right) => (Number.parseFloat(left) || Infinity) - (Number.parseFloat(right) || Infinity))[0]!;
  if (ratio.value !== "auto" && !ratioOptions.value.includes(ratio.value)) ratio.value = ratioOptions.value.includes("16:9") ? "16:9" : ratioOptions.value[0]!;
}, { flush: "sync" });

watch(() => props.directory, () => {
  // 参考图是旧文件夹里的相对路径，切换文件夹后不再有效。
  references.value = [];
  activeId.value = undefined;
});

void loadModels();

async function loadModels() {
  modelsLoading.value = true;
  try {
    models.value = (await ai.getMediaModels()).filter(item => item.type === "image");
    form.value.model = pickModel(models.value, form.value.model);
  } catch (error) {
    showNodeError(error, "模型读取失败");
  } finally {
    modelsLoading.value = false;
  }
}

async function startGeneration() {
  const input = generationInput.value;
  if (!input) return void showNodeError("请先选择图片模型", "图片生成失败");
  if (!input.prompt) return void showNodeError("请输入提示词", "图片生成失败");
  submitting.value = true;
  try {
    // 记录里保存所选参数，回填时恢复；提交给接口的是 input。
    const record = await submitRecord("image", props.directory, prompt.value.trim(), input, { model: form.value.model, references: usedReferences.value }, count.value);
    activeId.value = record.id;
  } catch (error) {
    showNodeError(error, "图片生成失败");
  } finally {
    submitting.value = false;
  }
}

function selectRecord(record: HistoryRecord) {
  activeId.value = record.id;
}

// 回填提示词、模型、参数与参考图；参考图文件已删除时生成会提示读取失败。
function fillRecord(record: HistoryRecord) {
  const input = record.input as Partial<NodeImageRequest>;
  const saved = (record.form ?? {}) as { model?: string; references?: ReferenceFile[] };
  prompt.value = record.prompt;
  if (saved.model && models.value.some(item => JSON.stringify([item.providerId, item.modelId]) === saved.model)) form.value.model = saved.model;
  size.value = input.size ?? "auto";
  ratio.value = input.ratio ?? "auto";
  const { quality: savedQuality, background, ...other } = input.other ?? {};
  quality.value = typeof savedQuality === "string" ? savedQuality : "auto";
  transparent.value = background === "transparent";
  form.value.other = other;
  references.value = [...saved.references ?? []];
  count.value = Math.min(Math.max(record.items.length, 1), maxCount);
  ElMessage.success("已回填这条记录的参数");
}

async function retry(record: HistoryRecord, item: HistoryItem) {
  try {
    await retryItem("image", props.directory, record, item);
  } catch (error) {
    showNodeError(error, "重试失败");
  }
}

async function removeHistory(record: HistoryRecord) {
  const pending = record.items.some(item => item.status === "pending");
  try {
    await ElMessageBox.confirm(pending ? "这条记录还在生成中，删除后结果不会再写入记录（云端仍会扣费）。生成的图片文件保留在文件夹里。" : "只删除记录，已生成的图片文件保留在文件夹里。", "删除生成记录", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" });
  } catch { return; }
  try {
    await removeRecord("image", props.directory, record.id);
  } catch (error) {
    showNodeError(error, "删除记录失败");
  }
}

// 填入提示词，并把提示词自带的参考图下载到 references 后追加到参考图，超出模型上限的不添加。
async function usePrompt(text: string, urls: string[]) {
  prompt.value = text;
  if (!urls.length) return;
  if (!referenceLimit.value) return void ElMessage.warning("当前模型不支持参考图，只填入了提示词");
  const directory = props.directory;
  importing.value = true;
  try {
    const { images, failed } = await importReferenceImages(directory, urls);
    if (directory !== props.directory) return;
    const next = [...references.value, ...images.filter(item => !references.value.some(current => current.path === item.path))];
    references.value = next.slice(0, referenceLimit.value);
    const skipped = next.length - references.value.length;
    if (failed || skipped) ElMessage.warning([failed && `${failed} 张参考图下载失败（境外图源需在设置 → 网络设置中配置代理）`, skipped && `${skipped} 张超出模型上限未添加`].filter(Boolean).join("，"));
  } finally {
    importing.value = false;
  }
}

function addReference(path: string) {
  if (references.value.some(item => item.path === path)) return;
  if (references.value.length >= referenceLimit.value) return void ElMessage.warning("参考图已达上限");
  references.value.push({ path, mimeType: imageMimeType(path)! });
}
</script>

<style lang="scss" scoped>
.studioPanel {
  .promptInput :deep(.el-textarea__inner) { padding: 10px 12px; line-height: 1.7; }

  .switchOption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;

    .switchText {
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: var(--el-text-color-primary);
      font-size: 13px;
      font-weight: 600;

      .fieldHint { color: var(--el-text-color-secondary); font-size: 12px; font-weight: 400; }
    }
  }

  .countPicker {
    display: flex;
    align-items: center;
    gap: 8px;

    .el-segmented { flex: 1; min-width: 0; }
    .el-input-number { flex-shrink: 0; width: 76px; }
  }

  .recordPrompt {
    margin: 0 0 14px;
    color: var(--el-text-color-regular);
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .priceRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .generateButton {
    width: 100%;
    height: 44px;
    margin: 0;
    border: 0;
    border-radius: calc(var(--ui-radius) * 1.5);
    background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
    box-shadow: 0 6px 18px color-mix(in srgb, var(--el-color-primary) 32%, transparent);
    font-size: 15px;
    font-weight: 600;
    transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;

    &:hover:not(.is-disabled) { transform: translateY(-1px); box-shadow: 0 8px 22px color-mix(in srgb, var(--el-color-primary) 40%, transparent); }
    &.is-disabled { box-shadow: none; opacity: 0.5; }

    @media (prefers-reduced-motion: reduce) { transition: none; &:hover:not(.is-disabled) { transform: none; } }
  }

  .generatingTag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 12px;
    line-height: 22px;
    font-variant-numeric: tabular-nums;
  }

  .resultGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;

    .pendingCard {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      aspect-ratio: 1;
      padding: 16px;
      overflow: hidden;
      border: 1px dashed var(--el-color-primary-light-5);
      border-radius: calc(var(--ui-radius) * 1.5);
      background-color: var(--el-fill-color-lighter);
      background-image: radial-gradient(circle, color-mix(in srgb, var(--el-color-primary) 30%, transparent) 1.2px, transparent 1.6px);
      background-size: 16px 16px;
      color: var(--el-color-primary);
      box-sizing: border-box;

      .pendingShine {
        position: absolute;
        inset: 0;
        background: linear-gradient(110deg, transparent 30%, color-mix(in srgb, var(--el-color-primary) 14%, transparent) 50%, transparent 70%);
        background-size: 200% 100%;
        animation: shine 1.8s linear infinite;
      }

      .pendingText { font-size: 13px; font-weight: 500; }

      .pendingPrompt {
        display: -webkit-box;
        max-width: 100%;
        overflow: hidden;
        color: var(--el-text-color-secondary);
        font-size: 12px;
        line-height: 1.6;
        text-align: center;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      @media (prefers-reduced-motion: reduce) { .pendingShine { animation: none; } }

      &.failedCard {
        border: 1px solid var(--el-color-danger-light-5);
        background: var(--el-color-danger-light-9);
        color: var(--el-color-danger);
      }
    }
  }
}

@keyframes shine {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
