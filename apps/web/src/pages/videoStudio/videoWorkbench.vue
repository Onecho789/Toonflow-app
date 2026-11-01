<template>
  <div class="videoWorkbench">
    <el-scrollbar class="paramPanel" tag="section" aria-label="生成参数">
      <div class="panelContent">
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
          <div v-if="durations.length || resolutions.length" class="fieldRow">
            <div v-if="durations.length" class="fieldItem">
              <div class="fieldLabel">时长</div>
              <el-select v-model="data.duration" :disabled="generating" aria-label="视频时长">
                <el-option v-for="item in durations" :key="item" :value="item" :label="`${item}秒`" />
              </el-select>
            </div>
            <div v-if="resolutions.length" class="fieldItem">
              <div class="fieldLabel">分辨率</div>
              <el-select v-model="data.resolution" :disabled="generating" aria-label="视频分辨率">
                <el-option v-for="item in resolutions" :key="item" :value="item" :label="item" />
              </el-select>
            </div>
          </div>
          <div class="fieldLabel">比例</div>
          <el-radio-group v-model="data.ratio" class="ratioGroup" :disabled="generating" aria-label="视频比例">
            <el-radio-button v-for="item in ratios" :key="item" :value="item" :label="item" />
          </el-radio-group>
          <div v-if="selectedModel.audio === 'optional'" class="audioOption">
            <span class="fieldLabel">生成音频</span>
            <el-switch v-model="data.generateAudio" :disabled="generating" aria-label="生成音频" />
          </div>
          <modelForm v-model="data.other" :rules="selectedModel.rules" :disabled="generating" />
        </template>
        <div class="promptHeader">
          <span class="fieldLabel">提示词</span>
          <promptLibrary type="video" :disabled="generating" @select="data.prompt = $event" />
        </div>
        <el-input v-model="data.prompt" type="textarea" :rows="6" resize="vertical" :disabled="generating" aria-label="提示词" />
        <div v-if="frameSupport.first || frameSupport.last" class="frameRow">
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
        <div class="generateBar">
          <mediaPrice v-if="generationInput" :input="{ ...generationInput, mediaType: 'video' }" :supported="selectedModel?.supportsPrice === true" />
          <el-button v-if="generating" :icon="IconPlayerStop" @click="controller?.abort()">取消生成</el-button>
          <el-button v-else type="primary" :icon="IconSparkles" :disabled="!!uploading || !selectedModel || !data.prompt.trim()" @click="startGeneration">生成视频</el-button>
        </div>
      </div>
    </el-scrollbar>
    <el-scrollbar class="resultPanel" tag="section" aria-label="生成结果">
      <div v-loading="resultsLoading" class="resultGrid" :aria-busy="resultsLoading">
        <article v-for="task in currentTasks" :key="task.id" class="taskCard" :class="{ failed: task.error }" :aria-busy="!task.error">
          <template v-if="task.error">
            <icon-alert-circle :size="28" aria-hidden="true" />
            <p class="taskError" role="alert">{{ task.error }}</p>
            <el-button size="small" text @click="tasks = tasks.filter(item => item !== task)">关闭</el-button>
          </template>
          <template v-else>
            <icon-loader-2 class="spinIcon" :size="28" aria-hidden="true" />
            <p>视频生成中，通常需要几分钟</p>
          </template>
          <p class="taskPrompt">{{ task.prompt }}</p>
        </article>
        <videoCard v-for="item in results" :key="item.path" :directory="directory" :path="item.path" :name="item.name" />
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch } from "vue";
import axios from "axios";
import { vLoading } from "element-plus";
import { IconAlertCircle, IconLoader2, IconPlayerStop, IconSparkles } from "@tabler/icons-vue";
import { useNodeAi, type NodeMediaModel, type NodeVideoRequest } from "@toonflow/nodes-scaffold/nodeAi";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import { useModelForm } from "@toonflow/node-shared/useModelForm";
import modelOption from "@toonflow/node-shared/modelOption";
import modelForm from "@toonflow/node-shared/modelForm";
import mediaPrice from "@toonflow/node-shared/mediaPrice";
import promptLibrary from "@toonflow/node-shared/promptLibrary";
import useWorkspaceFiles from "@/lib/workspaceFiles";
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
  display: flex;
  height: 100%;
  min-height: 0;

  .paramPanel {
    flex-shrink: 0;
    width: 360px;
    border-right: 1px solid var(--el-border-color-lighter);

    .panelContent {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 20px 24px;

      .fieldLabel {
        margin-top: 8px;
        color: var(--el-text-color-secondary);
        font-size: 12px;
        font-weight: 500;
      }

      .fieldRow {
        display: flex;
        gap: 12px;

        .fieldItem {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
      }

      .ratioGroup { flex-wrap: wrap; }

      .audioOption {
        display: flex;
        align-items: center;
        justify-content: space-between;

        .fieldLabel { margin-top: 0; }
      }

      .promptHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 8px;

        .fieldLabel { margin-top: 0; }
      }

      .frameRow {
        display: flex;
        gap: 12px;
        margin-top: 8px;
      }

      .generateBar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 16px;
      }
    }
  }

  .resultPanel {
    flex: 1;
    min-width: 0;

    .resultGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      align-items: start;
      gap: 16px;
      min-height: 200px;
      padding: 20px 24px;

      .taskCard {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        aspect-ratio: 16 / 9;
        padding: 16px;
        border: 1px dashed var(--el-border-color);
        border-radius: 10px;
        color: var(--el-text-color-secondary);
        font-size: 13px;
        text-align: center;
        box-sizing: border-box;
        overflow: hidden;

        p { margin: 0; }

        .spinIcon { animation: spin 1s linear infinite; }

        .taskPrompt {
          display: -webkit-box;
          max-width: 100%;
          overflow: hidden;
          color: var(--el-text-color-placeholder);
          font-size: 12px;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        &.failed {
          border-color: var(--el-color-danger-light-5);
          color: var(--el-color-danger);

          .taskError { overflow-wrap: anywhere; }
        }
      }
    }
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
