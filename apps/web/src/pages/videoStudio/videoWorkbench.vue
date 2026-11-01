<template>
  <workbenchLayout class="videoWorkbench" type="video" :count="results.length" :empty="!results.length && !currentTasks.length" :loading="resultsLoading">
    <template #settings>
      <div class="fieldLabel">提示词<promptLibrary type="video" :disabled="generating" @select="data.prompt = $event" /></div>
      <el-input
        v-model="data.prompt"
        class="promptInput"
        type="textarea"
        :autosize="{ minRows: 5, maxRows: 14 }"
        :disabled="generating"
        placeholder="描述镜头内容与运动，例如：镜头缓缓推近，少女在樱花树下回眸微笑，花瓣随风飘落"
        aria-label="提示词" />
      <template v-if="frameSupport.first || frameSupport.last">
        <div class="fieldLabel">首尾帧<span class="fieldHint">可选，上传后按图生成</span></div>
        <div class="frameRow">
          <frameSlot
            v-if="frameSupport.first"
            label="首帧"
            :previewUrl="frames.first?.previewUrl"
            :uploading="uploading === 'first'"
            :disabled="generating || !!uploading"
            @select="uploadFrame('first', $event)"
            @remove="removeFrame('first')" />
          <frameSlot
            v-if="frameSupport.last"
            label="尾帧"
            :previewUrl="frames.last?.previewUrl"
            :uploading="uploading === 'last'"
            :disabled="generating || !!uploading"
            @select="uploadFrame('last', $event)"
            @remove="removeFrame('last')" />
        </div>
      </template>
      <div class="fieldLabel">模型</div>
      <el-select
        v-model="data.model"
        filterable
        :loading="modelsLoading"
        :disabled="generating"
        placeholder="选择模型"
        aria-label="视频模型"
        noDataText="暂无可用的视频模型"
        @visibleChange="(visible: boolean) => visible && loadModels()">
        <template #prefix><modelOption v-if="selectedModel" :model="selectedModel" iconOnly :size="17" /></template>
        <el-option-group v-for="provider in modelGroups" :key="provider.id" :label="provider.label">
          <el-option v-for="item in provider.models" :key="item.modelId" :label="item.label" :value="modelKey(item)">
            <modelOption :model="item" />
          </el-option>
        </el-option-group>
      </el-select>
      <template v-if="selectedModel">
        <div class="fieldLabel">比例</div>
        <ratioPicker v-model="data.ratio" :options="ratios" label="视频比例" :disabled="generating" />
        <template v-if="durations.length">
          <div class="fieldLabel">时长</div>
          <el-segmented v-model="data.duration" :options="durationOptions" :disabled="generating" block aria-label="视频时长" />
        </template>
        <template v-if="resolutions.length">
          <div class="fieldLabel">分辨率</div>
          <el-segmented v-model="data.resolution" :options="resolutions" :disabled="generating" block aria-label="视频分辨率" />
        </template>
        <div v-if="selectedModel.audio === 'optional'" class="audioOption">
          <span class="audioText"><icon-volume :size="16" aria-hidden="true" />生成音频</span>
          <el-switch v-model="data.generateAudio" :disabled="generating" aria-label="生成音频" />
        </div>
        <modelForm v-model="data.other" :rules="selectedModel.rules" :disabled="generating" />
      </template>
    </template>

    <template #actions>
      <div class="priceRow">
        <span>预估费用</span>
        <mediaPrice v-if="generationInput" :input="{ ...generationInput, mediaType: 'video' }" :supported="selectedModel?.supportsPrice === true" />
      </div>
      <el-button v-if="generating" class="generateButton stopButton" size="large" :icon="IconPlayerStop" @click="controller?.abort()">取消生成</el-button>
      <el-button
        v-else
        class="generateButton"
        type="primary"
        size="large"
        :icon="IconSparkles"
        :disabled="!!uploading || !selectedModel || !data.prompt.trim()"
        @click="startGeneration">
        生成视频
      </el-button>
    </template>

    <template #results>
      <div class="resultGrid">
        <article v-for="task in currentTasks" :key="task.id" class="taskCard" :class="{ failed: task.error }" :aria-busy="!task.error">
          <template v-if="task.error">
            <icon-alert-circle :size="28" aria-hidden="true" />
            <p class="taskTitle">生成失败</p>
            <p class="taskError" role="alert">{{ task.error }}</p>
            <el-button size="small" round @click="tasks = tasks.filter(item => item !== task)">关闭</el-button>
          </template>
          <template v-else>
            <span class="taskShine" aria-hidden="true" />
            <icon-loader-2 class="spinIcon" :size="28" aria-hidden="true" />
            <p class="taskTitle">视频生成中，通常需要几分钟</p>
          </template>
          <p class="taskPrompt">{{ task.prompt }}</p>
        </article>
        <videoCard v-for="item in results" :key="item.path" :directory="directory" :path="item.path" :name="item.name" />
      </div>
    </template>
  </workbenchLayout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch } from "vue";
import axios from "axios";
import { IconAlertCircle, IconLoader2, IconPlayerStop, IconSparkles, IconVolume } from "@tabler/icons-vue";
import { useNodeAi, type NodeMediaModel, type NodeVideoRequest } from "@toonflow/nodes-scaffold/nodeAi";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import { useModelForm } from "@toonflow/node-shared/useModelForm";
import modelOption from "@toonflow/node-shared/modelOption";
import modelForm from "@toonflow/node-shared/modelForm";
import mediaPrice from "@toonflow/node-shared/mediaPrice";
import promptLibrary from "@toonflow/node-shared/promptLibrary";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import workbenchLayout from "@/components/workbenchLayout.vue";
import ratioPicker from "@/components/ratioPicker.vue";
import frameSlot from "./frameSlot.vue";
import videoCard from "./videoCard.vue";

type FrameKey = "first" | "last";
type Frame = { path: string; mimeType: string; previewUrl: string };
type Task = { id: string; directory: string; prompt: string; error: string };

const props = defineProps<{ directory: string }>();
const outputDirectory = "generated";
const frameDirectory = "frames";
// ACT: 后台未配置 meta.ratios 时沿用通用比例，与视频生成节点一致，具体支持范围由云端校验。
const defaultRatios = ["16:9", "9:16", "1:1"];
const ai = useNodeAi();
provide("workspaceDirectory", () => props.directory);
const data = ref({ model: "", prompt: "", duration: undefined as number | undefined, resolution: "", ratio: "9:16", generateAudio: true, other: {} as Record<string, unknown> });
const models = shallowRef<NodeMediaModel[]>([]);
const modelsLoading = ref(false);
const frames = reactive<Partial<Record<FrameKey, Frame>>>({});
const uploading = ref<FrameKey>();
const results = ref<{ name: string; path: string }[]>([]);
const resultsLoading = ref(false);
const tasks = ref<Task[]>([]);
const controller = shallowRef<AbortController>();
const generating = computed(() => !!controller.value);
const currentTasks = computed(() => tasks.value.filter(item => item.directory === props.directory));

const modelKey = (item: NodeMediaModel) => JSON.stringify([item.providerId, item.modelId]);
const selectedModel = computed(() => models.value.find(item => modelKey(item) === data.value.model));
useModelForm(data, selectedModel);
const modelGroups = computed(() => groupNodeModels(models.value));
const ratios = computed(() => selectedModel.value?.ratios?.length ? selectedModel.value.ratios : defaultRatios);
const durations = computed(() => [...new Set((selectedModel.value?.durationResolutionMap ?? []).flatMap(item => item.duration))].sort((a, b) => a - b));
const durationOptions = computed(() => durations.value.map(item => ({ label: `${item}秒`, value: item })));
const resolutions = computed(() => [...new Set((selectedModel.value?.durationResolutionMap ?? [])
  .filter(item => data.value.duration !== undefined && item.duration.includes(data.value.duration)).flatMap(item => item.resolution))]
  .sort((left, right) => (Number.parseFloat(left) || Infinity) - (Number.parseFloat(right) || Infinity)));
// 首尾帧按模型 mode 显示；数组形式的参考生视频模式不在工作台提供。
const modes = computed(() => (selectedModel.value?.mode ?? []).filter((item): item is string => typeof item === "string"));
const frameSupport = computed(() => ({
  first: modes.value.some(item => ["singleImage", "startEndRequired", "endFrameOptional", "startFrameOptional"].includes(item)),
  last: modes.value.some(item => ["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(item)),
}));
const first = computed(() => frameSupport.value.first ? frames.first : undefined);
const last = computed(() => frameSupport.value.last ? frames.last : undefined);
const selectedMode = computed(() => {
  const candidates = first.value && last.value ? ["startEndRequired", "endFrameOptional", "startFrameOptional"]
    : first.value ? ["endFrameOptional", "singleImage"] : last.value ? ["startFrameOptional"] : ["text"];
  return candidates.find(item => modes.value.includes(item)) as NodeVideoRequest["mode"];
});
const generationInput = computed((): Omit<NodeVideoRequest, "directory"> | undefined => {
  const choice = selectedModel.value;
  if (!choice) return;
  const mode = selectedMode.value;
  const reference = (frame?: Frame) => frame && { path: frame.path, mimeType: frame.mimeType };
  return {
    providerId: choice.providerId,
    modelId: choice.modelId,
    prompt: data.value.prompt.trim(),
    mode,
    duration: data.value.duration,
    resolution: data.value.resolution || undefined,
    ratio: data.value.ratio,
    generateAudio: choice.audio === "optional" ? data.value.generateAudio : choice.audio,
    other: Object.keys(data.value.other).length ? { ...data.value.other } : undefined,
    outputDirectory,
    images: mode === "singleImage" && first.value ? [reference(first.value)!] : undefined,
    firstFrame: mode === "singleImage" ? undefined : reference(first.value),
    lastFrame: reference(last.value),
  };
});

// 参数归一化与视频生成节点一致：切换模型或时长后回落到第一个可用值。
watch([selectedModel, () => data.value.duration], ([choice]) => {
  if (!choice) return;
  if (!durations.value.includes(data.value.duration!)) data.value.duration = durations.value[0];
  if (!resolutions.value.includes(data.value.resolution)) data.value.resolution = resolutions.value[0] ?? "";
  if (!ratios.value.includes(data.value.ratio)) data.value.ratio = ratios.value.includes("9:16") ? "9:16" : ratios.value[0]!;
  if (choice.audio !== "optional") data.value.generateAudio = choice.audio === true;
}, { flush: "sync" });

// 首尾帧文件属于所选文件夹，切换文件夹后清空并重新读取结果。
// ACT: 进行中的任务不随切换取消（取消不保证退费），同一时间只允许一个任务，切换后参数仍保持禁用直到任务结束。
watch(() => props.directory, () => {
  results.value = [];
  removeFrame("first");
  removeFrame("last");
  void loadResults();
});
onMounted(() => {
  void loadModels();
  void loadResults();
});
onBeforeUnmount(() => {
  removeFrame("first");
  removeFrame("last");
});

function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string }>(error)) return error.response?.data?.message || error.message || fallback;
  return error instanceof Error ? error.message || fallback : fallback;
}

async function loadModels() {
  if (modelsLoading.value) return;
  modelsLoading.value = true;
  try {
    models.value = (await ai.getMediaModels()).filter(item => item.type === "video");
    if (!selectedModel.value && !generating.value) data.value.model = models.value[0] ? modelKey(models.value[0]) : "";
  } catch (error) {
    showNodeError(error, "模型读取失败");
  } finally {
    modelsLoading.value = false;
  }
}

async function loadResults() {
  const directory = props.directory;
  resultsLoading.value = true;
  try {
    const { entries } = await useWorkspaceFiles(directory).list(outputDirectory).catch(error => {
      if (axios.isAxiosError(error) && error.response?.status === 404) return { entries: [] };
      throw error;
    });
    if (directory !== props.directory) return;
    results.value = entries.filter(item => item.type === "file" && /\.(mp4|webm|mov|ogv)$/i.test(item.name))
      .sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0));
  } catch (error) {
    if (directory === props.directory) showNodeError(error, "生成结果读取失败");
  } finally {
    if (directory === props.directory) resultsLoading.value = false;
  }
}

async function uploadFrame(key: FrameKey, file: File) {
  if (!file.type.startsWith("image/")) return void showNodeError("请选择图片文件", "上传失败");
  const directory = props.directory;
  const files = useWorkspaceFiles(directory);
  uploading.value = key;
  try {
    await files.mkdir(frameDirectory).catch(error => {
      if (!axios.isAxiosError<{ data?: { code?: string } }>(error) || error.response?.data?.data?.code !== "EEXIST") throw error;
    });
    const extension = file.name.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0].toLowerCase() ?? "";
    const path = `${frameDirectory}/${crypto.randomUUID()}${extension}`;
    await files.write(path, file, true);
    if (directory !== props.directory) return;
    removeFrame(key);
    frames[key] = { path, mimeType: file.type, previewUrl: URL.createObjectURL(file) };
  } catch (error) {
    showNodeError(error, "上传失败");
  } finally {
    uploading.value = undefined;
  }
}

// 只移除当前选择，已写入文件夹的图片保留，避免误删用户文件。
function removeFrame(key: FrameKey) {
  const frame = frames[key];
  if (frame) URL.revokeObjectURL(frame.previewUrl);
  delete frames[key];
}

async function startGeneration() {
  const directory = props.directory;
  const input = generationInput.value;
  if (!input) return void showNodeError("请先选择视频模型", "视频生成失败");
  if (!input.prompt) return void showNodeError("请输入生成提示词", "视频生成失败");
  if (modes.value.length && !input.mode) return void showNodeError("当前模型不支持这种首尾帧组合，请调整首尾帧或更换模型", "视频生成失败");
  const current = new AbortController();
  const task = reactive<Task>({ id: crypto.randomUUID(), directory, prompt: input.prompt, error: "" });
  controller.value = current;
  tasks.value.unshift(task);
  try {
    const [result] = await ai.generateVideo({ ...input, directory }, current.signal);
    if (!result) throw new Error("供应商未返回视频");
    tasks.value = tasks.value.filter(item => item !== task);
    if (directory === props.directory) await loadResults();
  } catch (error) {
    if (current.signal.aborted) tasks.value = tasks.value.filter(item => item !== task);
    else task.error = errorMessage(error, "视频生成失败");
  } finally {
    controller.value = undefined;
  }
}
</script>

<style lang="scss" scoped>
.videoWorkbench {
  .promptInput :deep(.el-textarea__inner) { padding: 10px 12px; line-height: 1.7; }

  .frameRow { display: flex; gap: 10px; }

  .audioOption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    padding: 8px 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--ui-radius);
    background: var(--el-fill-color-lighter);

    .audioText { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
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
    border-radius: calc(var(--ui-radius) * 1.5);
    font-size: 15px;
    font-weight: 600;
    transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;

    &:not(.stopButton) {
      border: 0;
      background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
      box-shadow: 0 6px 18px color-mix(in srgb, var(--el-color-primary) 32%, transparent);

      &:hover:not(.is-disabled) { transform: translateY(-1px); box-shadow: 0 8px 22px color-mix(in srgb, var(--el-color-primary) 40%, transparent); }
      &.is-disabled { box-shadow: none; opacity: 0.5; }
    }

    @media (prefers-reduced-motion: reduce) { transition: none; &:hover:not(.is-disabled) { transform: none; } }
  }

  .resultGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;

    .taskCard {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      aspect-ratio: 16 / 9;
      padding: 16px;
      overflow: hidden;
      border: 1px dashed var(--el-color-primary-light-5);
      border-radius: calc(var(--ui-radius) * 1.5);
      background-color: var(--el-fill-color-lighter);
      background-image: radial-gradient(circle, color-mix(in srgb, var(--el-color-primary) 30%, transparent) 1.2px, transparent 1.6px);
      background-size: 16px 16px;
      color: var(--el-color-primary);
      text-align: center;
      box-sizing: border-box;

      p { margin: 0; }

      .taskShine {
        position: absolute;
        inset: 0;
        background: linear-gradient(110deg, transparent 30%, color-mix(in srgb, var(--el-color-primary) 14%, transparent) 50%, transparent 70%);
        background-size: 200% 100%;
        animation: shine 1.8s linear infinite;
        pointer-events: none;
      }

      .spinIcon { animation: spin 1s linear infinite; }

      .taskTitle { font-size: 13px; font-weight: 500; }

      .taskPrompt {
        display: -webkit-box;
        max-width: 100%;
        overflow: hidden;
        color: var(--el-text-color-secondary);
        font-size: 12px;
        line-height: 1.6;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      &.failed {
        border: 1px solid var(--el-color-danger-light-5);
        background: var(--el-color-danger-light-9);
        color: var(--el-color-danger);

        .taskError {
          display: -webkit-box;
          max-width: 100%;
          overflow: hidden;
          font-size: 12px;
          overflow-wrap: anywhere;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
        }
      }

      @media (prefers-reduced-motion: reduce) { .taskShine, .spinIcon { animation: none; } }
    }
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes shine {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
