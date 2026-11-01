<template>
  <workbenchLayout class="studioPanel" type="image" :count="results.length" :empty="!results.length && generatingDirectory !== directory">
    <template #settings>
      <div class="fieldLabel">提示词<promptLibrary type="image" :disabled="generating" @select="prompt = $event" /></div>
      <el-input v-model="prompt" class="promptInput" type="textarea" :autosize="{ minRows: 5, maxRows: 14 }" :disabled="generating" placeholder="描述你想要的画面，例如：清晨薄雾中的江南小镇，石桥与乌篷船，电影感光影" aria-label="提示词" />

      <div class="fieldLabel">参考图<span class="fieldHint">{{ references.length ? `已选 ${references.length} 张` : "可选" }}</span></div>
      <div class="referenceList">
        <div v-for="(item, index) in references" :key="item.path" class="referenceItem">
          <studioImage :directory="directory" :path="item.path" :alt="`参考图 ${index + 1}`" />
          <span class="referenceIndex">图{{ index + 1 }}</span>
          <button type="button" class="removeButton" :disabled="generating" :aria-label="`移除参考图 ${index + 1}`" @click="references.splice(index, 1)"><icon-x :size="12" /></button>
        </div>
        <button type="button" class="referenceAdd" :disabled="generating || uploading" aria-label="上传参考图" @click="fileInput?.click()">
          <el-icon v-if="uploading" class="is-loading" :size="18"><icon-loader-2 /></el-icon>
          <icon-photo-plus v-else :size="20" aria-hidden="true" />
          <span>上传</span>
        </button>
        <input ref="fileInput" type="file" accept="image/*" multiple hidden aria-label="选择参考图" @change="uploadReferences" />
      </div>

      <div class="fieldLabel">模型</div>
      <el-select
        v-model="form.model"
        filterable
        :loading="modelsLoading"
        :disabled="generating"
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
        <div class="fieldLabel">比例</div>
        <ratioPicker v-model="ratio" :options="ratioOptions" label="图片比例" :disabled="generating" />
        <div class="fieldLabel">分辨率</div>
        <el-segmented v-model="size" class="sizeSegmented" :options="sizeOptions" :disabled="generating" block aria-label="图片分辨率" />
        <modelForm v-model="form.other" :rules="selectedModel.rules" :disabled="generating" />
      </template>
    </template>

    <template #actions>
      <div class="priceRow">
        <span>预估费用</span>
        <mediaPrice v-if="generationInput" :input="{ ...generationInput, mediaType: 'image' }" :supported="selectedModel?.supportsPrice === true" />
      </div>
      <el-button
        class="generateButton"
        type="primary"
        size="large"
        :icon="generating ? IconPlayerStop : IconSparkles"
        :disabled="!generating && (uploading || !generationInput?.prompt)"
        @click="generating ? controller?.abort() : startGeneration()">
        {{ generating ? "停止生成" : "生成图片" }}
      </el-button>
    </template>

    <template #resultExtra>
      <span v-if="generatingDirectory === directory" class="generatingTag" role="status"><el-icon class="is-loading"><icon-loader-2 /></el-icon>生成中 {{ elapsedText }}</span>
    </template>

    <template #results>
      <div class="resultGrid">
        <div v-if="generatingDirectory === directory" class="pendingCard" aria-label="正在生成">
          <span class="pendingShine" aria-hidden="true" />
          <el-icon class="is-loading" :size="26"><icon-loader-2 /></el-icon>
          <span class="pendingText">正在绘制…</span>
          <span class="pendingPrompt">{{ generatingPrompt }}</span>
        </div>
        <resultCard
          v-for="path in results"
          :key="path"
          :directory="directory"
          :path="path"
          @preview="preview = { url: $event, name: path.split('/').at(-1) }"
          @reference="addReference(path)" />
      </div>
      <mediaPreview :modelValue="!!preview" :items="preview ? [{ ...preview, type: 'image' }] : []" @update:modelValue="!$event && (preview = undefined)" />
    </template>
  </workbenchLayout>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, provide, ref, shallowRef, watch } from "vue";
import axios from "axios";
import { ElButton, ElIcon, ElInput, ElOption, ElOptionGroup, ElSegmented, ElSelect } from "element-plus";
import { IconLoader2, IconPhotoPlus, IconPlayerStop, IconSparkles, IconX } from "@tabler/icons-vue";
import { useNodeAi, type NodeImageRequest, type NodeMediaModel } from "@toonflow/nodes-scaffold/nodeAi";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import { useModelForm } from "@toonflow/node-shared/useModelForm";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import modelForm from "@toonflow/node-shared/modelForm";
import modelOption from "@toonflow/node-shared/modelOption";
import mediaPrice from "@toonflow/node-shared/mediaPrice";
import mediaPreview from "@toonflow/node-shared/mediaPreview";
import promptLibrary from "@toonflow/node-shared/promptLibrary";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import workbenchLayout from "@/components/workbenchLayout.vue";
import ratioPicker from "@/components/ratioPicker.vue";
import { imageExtension, imageMimeType, timestampName } from "./studioFiles";
import studioImage from "./studioImage.vue";
import resultCard from "./resultCard.vue";

const props = defineProps<{ directory: string }>();
const outputDirectory = "generated";
const referenceDirectory = "references";
const ai = useNodeAi();
const models = shallowRef<NodeMediaModel[]>([]);
const modelsLoading = ref(false);
const form = ref<{ model: string; other: Record<string, unknown> }>({ model: "", other: {} });
const size = ref("");
const ratio = ref("");
const prompt = ref("");
const references = ref<{ path: string; mimeType: string }[]>([]);
const results = ref<string[]>([]);
const uploading = ref(false);
const generating = ref(false);
// 占位卡只显示在发起生成的文件夹里。
const generatingDirectory = ref("");
const generatingPrompt = ref("");
const elapsedSeconds = ref(0);
const elapsedText = computed(() => `${Math.floor(elapsedSeconds.value / 60)}:${String(elapsedSeconds.value % 60).padStart(2, "0")}`);
let elapsedTimer: ReturnType<typeof setInterval> | undefined;
onScopeDispose(() => clearInterval(elapsedTimer));
const controller = shallowRef<AbortController>();
const fileInput = ref<HTMLInputElement>();
const preview = ref<{ url: string; name?: string }>();
const selectedModel = computed(() => models.value.find(item => JSON.stringify([item.providerId, item.modelId]) === form.value.model));
const modelGroups = computed(() => groupNodeModels(models.value));
const sizeOptions = computed(() => selectedModel.value?.imageSizes?.length ? selectedModel.value.imageSizes : ["2K"]);
const ratioOptions = computed(() => selectedModel.value?.imageRatios?.length ? selectedModel.value.imageRatios : ["16:9"]);
const generationInput = computed<Omit<NodeImageRequest, "directory"> | undefined>(() => {
  const choice = selectedModel.value;
  if (!choice) return;
  return {
    providerId: choice.providerId,
    modelId: choice.modelId,
    prompt: prompt.value.trim(),
    size: size.value,
    ratio: ratio.value,
    other: Object.keys(form.value.other).length ? { ...form.value.other } : undefined,
    outputDirectory,
    images: references.value.map(item => ({ ...item })),
  };
});

// mediaPrice 通过注入读取工作目录估价。
provide("workspaceDirectory", () => props.directory);
useModelForm(form, selectedModel);

watch(selectedModel, choice => {
  if (!choice) return;
  // ACT: 与图片生成节点一致，分辨率默认取数值最小的一档，比例优先 16:9。
  if (!sizeOptions.value.includes(size.value)) size.value = sizeOptions.value.toSorted((left, right) => (Number.parseFloat(left) || Infinity) - (Number.parseFloat(right) || Infinity))[0]!;
  if (!ratioOptions.value.includes(ratio.value)) ratio.value = ratioOptions.value.includes("16:9") ? "16:9" : ratioOptions.value[0]!;
}, { flush: "sync" });

watch(() => props.directory, () => {
  // 参考图是旧文件夹里的相对路径，切换文件夹后不再有效。
  references.value = [];
  results.value = [];
  void loadResults().catch(error => showNodeError(error, "结果读取失败"));
}, { immediate: true });

void loadModels();

async function loadModels() {
  modelsLoading.value = true;
  try {
    models.value = (await ai.getMediaModels()).filter(item => item.type === "image");
    if (!selectedModel.value) {
      const first = models.value[0];
      form.value.model = first ? JSON.stringify([first.providerId, first.modelId]) : "";
    }
  } catch (error) {
    showNodeError(error, "模型读取失败");
  } finally {
    modelsLoading.value = false;
  }
}

async function loadResults() {
  const directory = props.directory;
  const entries = await useWorkspaceFiles(directory).list(outputDirectory).then(data => data.entries).catch(error => {
    if (axios.isAxiosError(error) && error.response?.status === 404) return [];
    throw error;
  });
  if (directory !== props.directory) return;
  results.value = entries.filter(item => item.type === "file" && imageMimeType(item.name))
    .sort((left, right) => (right.mtimeMs ?? 0) - (left.mtimeMs ?? 0)).map(item => item.path);
}

async function ensureDirectory(directory: string, path: string) {
  await useWorkspaceFiles(directory).mkdir(path).catch(error => { if (!axios.isAxiosError(error) || error.response?.status !== 409) throw error; });
}

async function startGeneration() {
  const input = generationInput.value;
  if (!input) return void showNodeError("请先选择图片模型", "图片生成失败");
  if (!input.prompt) return void showNodeError("请输入提示词", "图片生成失败");
  const directory = props.directory;
  const current = new AbortController();
  controller.value = current;
  generating.value = true;
  generatingDirectory.value = directory;
  generatingPrompt.value = input.prompt;
  elapsedSeconds.value = 0;
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => elapsedSeconds.value++, 1000);
  try {
    const [result] = await ai.generateImage({ ...input, directory }, current.signal);
    if (!result) throw new Error("麦麦云未返回图片");
  } catch (error) {
    showNodeError(error, "图片生成失败");
  } finally {
    if (controller.value === current) {
      controller.value = undefined;
      generating.value = false;
      generatingDirectory.value = "";
      clearInterval(elapsedTimer);
    }
    if (directory === props.directory) await loadResults().catch(error => showNodeError(error, "结果读取失败"));
  }
}

async function uploadReferences(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = [...input.files ?? []];
  input.value = "";
  if (!selected.length) return;
  const directory = props.directory;
  const files = useWorkspaceFiles(directory);
  uploading.value = true;
  try {
    await ensureDirectory(directory, referenceDirectory);
    for (const file of selected) {
      const extension = imageExtension(file.type);
      if (!extension) throw new Error(`不支持的图片格式：${file.name}`);
      if (!file.size || file.size > 100 * 1024 * 1024) throw new Error(`图片不能为空且不能超过 100 MB：${file.name}`);
      const path = `${referenceDirectory}/${timestampName()}.${extension}`;
      await files.write(path, file, true);
      if (directory === props.directory) references.value.push({ path, mimeType: file.type });
    }
  } catch (error) {
    showNodeError(error, "参考图上传失败");
  } finally {
    uploading.value = false;
  }
}

function addReference(path: string) {
  if (references.value.some(item => item.path === path)) return;
  references.value.push({ path, mimeType: imageMimeType(path)! });
}
</script>

<style lang="scss" scoped>
.studioPanel {
  .promptInput :deep(.el-textarea__inner) { padding: 10px 12px; line-height: 1.7; }

  .referenceList {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;

    .referenceItem,
    .referenceAdd {
      position: relative;
      overflow: hidden;
      aspect-ratio: 1;
      border-radius: var(--ui-radius);
    }

    .referenceItem {
      border: 1px solid var(--el-border-color-lighter);

      .referenceIndex {
        position: absolute;
        top: 4px;
        left: 4px;
        padding: 1px 5px;
        border-radius: 4px;
        background: rgb(0 0 0 / 60%);
        color: #fff;
        font-size: 10px;
        line-height: 1.5;
      }

      .removeButton {
        position: absolute;
        top: 4px;
        right: 4px;
        display: grid;
        place-items: center;
        width: 20px;
        height: 20px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: rgb(0 0 0 / 60%);
        color: #fff;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;

        &:focus-visible { opacity: 1; outline: 2px solid var(--el-color-primary); }
      }

      &:hover .removeButton { opacity: 1; }
    }

    .referenceAdd {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 0;
      border: 1px dashed var(--el-border-color);
      background: var(--el-fill-color-lighter);
      color: var(--el-text-color-secondary);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;

      &:hover:not(:disabled) { border-color: var(--el-color-primary); color: var(--el-color-primary); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
      &:disabled { cursor: not-allowed; opacity: 0.6; }
    }
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
    }
  }
}

@keyframes shine {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
