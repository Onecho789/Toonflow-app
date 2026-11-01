<template>
  <div class="studioPanel">
    <aside class="settingsColumn" aria-label="生成参数">
      <el-scrollbar>
        <div class="settingsBody">
          <div class="sectionLabel">模型</div>
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
            <div class="sectionLabel">分辨率</div>
            <el-radio-group v-model="size" :disabled="generating" aria-label="图片分辨率">
              <el-radio-button v-for="item in sizeOptions" :key="item" :value="item">{{ item }}</el-radio-button>
            </el-radio-group>
            <div class="sectionLabel">比例</div>
            <el-radio-group v-model="ratio" :disabled="generating" aria-label="图片比例">
              <el-radio-button v-for="item in ratioOptions" :key="item" :value="item">{{ item }}</el-radio-button>
            </el-radio-group>
            <modelForm v-model="form.other" :rules="selectedModel.rules" :disabled="generating" />
          </template>

          <div class="sectionLabel">
            <span>提示词</span>
            <promptLibrary type="image" :disabled="generating" @select="prompt = $event" />
          </div>
          <el-input v-model="prompt" type="textarea" :autosize="{ minRows: 6, maxRows: 16 }" :disabled="generating" aria-label="提示词" />

          <div class="sectionLabel">
            <span>参考图</span>
            <el-button :icon="IconUpload" text size="small" :loading="uploading" :disabled="generating" aria-label="上传参考图" @click="fileInput?.click()">上传</el-button>
            <input ref="fileInput" type="file" accept="image/*" multiple hidden aria-label="选择参考图" @change="uploadReferences" />
          </div>
          <div v-if="references.length" class="referenceList">
            <div v-for="(item, index) in references" :key="item.path" class="referenceItem">
              <studioImage :directory="directory" :path="item.path" :alt="`参考图 ${index + 1}`" />
              <el-button class="removeButton" :icon="IconX" circle size="small" :disabled="generating" :aria-label="`移除参考图 ${index + 1}`" @click="references.splice(index, 1)" />
            </div>
          </div>
        </div>
      </el-scrollbar>
      <div class="generateBar">
        <mediaPrice v-if="generationInput" :input="{ ...generationInput, mediaType: 'image' }" :supported="selectedModel?.supportsPrice === true" />
        <el-button
          type="primary"
          :icon="generating ? IconPlayerStop : IconSparkles"
          :disabled="!generating && (uploading || !generationInput?.prompt)"
          @click="generating ? controller?.abort() : startGeneration()">
          {{ generating ? "停止生成" : "生成" }}
        </el-button>
      </div>
    </aside>

    <section class="resultColumn" aria-label="生成结果">
      <el-scrollbar>
        <div class="resultGrid">
          <div v-if="generating" class="pendingCard" role="status" aria-label="正在生成">
            <el-icon class="is-loading" :size="28"><icon-loader-2 /></el-icon>
          </div>
          <resultCard
            v-for="path in results"
            :key="path"
            :directory="directory"
            :path="path"
            @preview="preview = { url: $event, name: path.split('/').at(-1) }"
            @reference="addReference(path)" />
        </div>
      </el-scrollbar>
    </section>
    <mediaPreview :modelValue="!!preview" :items="preview ? [{ ...preview, type: 'image' }] : []" @update:modelValue="!$event && (preview = undefined)" />
  </div>
</template>

<script setup lang="ts">
import { computed, provide, ref, shallowRef, watch } from "vue";
import axios from "axios";
import { ElButton, ElIcon, ElInput, ElOption, ElOptionGroup, ElRadioButton, ElRadioGroup, ElScrollbar, ElSelect } from "element-plus";
import { IconLoader2, IconPlayerStop, IconSparkles, IconUpload, IconX } from "@tabler/icons-vue";
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
  // ACT: 列表接口不返回修改时间，生成后改成时间戳文件名，按名称倒序即新的在前；其他文件排在后面。
  const stamped = (path: string) => /^\d{8}-\d{6}-/.test(path.split("/").at(-1)!);
  results.value = entries.filter(item => item.type === "file" && imageMimeType(item.name)).map(item => item.path)
    .sort((left, right) => Number(stamped(right)) - Number(stamped(left)) || right.localeCompare(left));
}

async function ensureDirectory(directory: string, path: string) {
  await useWorkspaceFiles(directory).mkdir(path).catch(error => { if (!axios.isAxiosError(error) || error.response?.status !== 409) throw error; });
}

async function startGeneration() {
  const input = generationInput.value;
  if (!input) return void showNodeError("请先选择图片模型", "图片生成失败");
  if (!input.prompt) return void showNodeError("请输入提示词", "图片生成失败");
  const directory = props.directory;
  const files = useWorkspaceFiles(directory);
  const current = new AbortController();
  controller.value = current;
  generating.value = true;
  try {
    const [result] = await ai.generateImage({ ...input, directory }, current.signal);
    if (!result) throw new Error("麦麦云未返回图片");
    const extension = result.path.split(".").at(-1);
    await files.rename(result.path, `${outputDirectory}/${timestampName()}.${extension}`)
      .catch(error => showNodeError(error, "图片已生成，但按时间重命名失败"));
  } catch (error) {
    showNodeError(error, "图片生成失败");
  } finally {
    if (controller.value === current) {
      controller.value = undefined;
      generating.value = false;
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
  display: flex;
  height: 100%;
  min-height: 0;

  .settingsColumn {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 360px;
    border-right: 1px solid var(--el-border-color-lighter);

    .settingsBody {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px 20px;

      .sectionLabel {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 24px;
        margin-top: 8px;
        color: var(--el-text-color-secondary);
        font-size: 12px;
        font-weight: 500;
      }

      .el-radio-group { flex-wrap: wrap; gap: 6px 0; }

      .referenceList {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;

        .referenceItem {
          position: relative;
          overflow: hidden;
          aspect-ratio: 1;
          border-radius: 6px;

          .removeButton {
            position: absolute;
            top: 4px;
            right: 4px;
          }
        }
      }
    }

    .generateBar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      flex-shrink: 0;
      padding: 12px 20px;
      border-top: 1px solid var(--el-border-color-lighter);
    }
  }

  .resultColumn {
    flex: 1;
    min-width: 0;

    .resultGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      padding: 20px 24px;

      .pendingCard {
        display: flex;
        align-items: center;
        justify-content: center;
        aspect-ratio: 1;
        border: 1px dashed var(--el-border-color);
        border-radius: 8px;
        color: var(--el-text-color-secondary);
      }
    }
  }
}
</style>
