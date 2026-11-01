<template>
  <workbenchLayout class="videoWorkbench" type="video" :count="activeFiles.length" :historyCount="history.records.length" :empty="!activeRecord" :loading="!history.loaded && !history.error">
    <template #history>
      <historyList :records="history.records" type="video" :directory="directory" :activeId="activeRecord?.id" :error="history.error" @select="activeId = $event.id" @remove="removeHistory" />
    </template>

    <template #settings>
      <div class="fieldLabel">模型</div>
      <el-select
        v-model="data.model"
        filterable
        :loading="modelsLoading"
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

      <template v-if="modeOptions.length > 1">
        <div class="fieldLabel">生成方式</div>
        <el-segmented v-model="data.tab" :options="modeOptions" block aria-label="生成方式" />
      </template>

      <div class="fieldLabel">提示词<promptLibrary type="video" :disabled="importing" @select="usePrompt">提示词库</promptLibrary></div>
      <el-input
        v-model="data.prompt"
        class="promptInput"
        type="textarea"
        :autosize="{ minRows: 5, maxRows: 14 }"
        :placeholder="data.tab === 'reference' ? '描述镜头内容，可用“图1”“视频1”“音频1”引用下方素材，例如：图1的人物在图2的场景里跳舞，配乐参考音频1' : '描述镜头内容与运动，例如：镜头缓缓推近，少女在樱花树下回眸微笑，花瓣随风飘落'"
        aria-label="提示词" />

      <template v-if="data.tab === 'frames'">
        <div class="fieldLabel">首尾帧<span class="fieldHint">{{ frameHint }}</span></div>
        <div class="frameRow">
          <frameSlot
            v-if="frameSupport.first"
            label="首帧"
            :directory="directory"
            :path="data.firstFrame?.path"
            :uploading="uploading === 'first'"
            :disabled="!!uploading"
            @select="uploadFrame('first', $event)"
            @remove="data.firstFrame = undefined" />
          <frameSlot
            v-if="frameSupport.last"
            label="尾帧"
            :directory="directory"
            :path="data.lastFrame?.path"
            :uploading="uploading === 'last'"
            :disabled="!!uploading"
            @select="uploadFrame('last', $event)"
            @remove="data.lastFrame = undefined" />
        </div>
      </template>

      <template v-if="data.tab === 'reference'">
        <div class="fieldLabel">参考素材<span class="fieldHint">{{ referenceHint }}</span></div>
        <referenceList v-model="data.references" :directory="directory" :kinds="referenceKinds" :limits="referenceLimits" />
      </template>

      <template v-if="selectedModel">
        <div class="fieldLabel">比例</div>
        <ratioPicker v-model="data.ratio" :options="ratios" label="视频比例" />
        <template v-if="durations.length">
          <div class="fieldLabel">时长<span class="fieldHint">{{ data.duration }} 秒</span></div>
          <div v-if="durationRange" class="durationRange">
            <el-slider v-model="data.duration" :min="durationRange.min" :max="durationRange.max" :step="1" :showTooltip="false" aria-label="视频时长" />
            <el-input-number v-model="data.duration" :min="durationRange.min" :max="durationRange.max" :precision="0" :step="1" controlsPosition="right" size="small" aria-label="视频时长（秒）" />
          </div>
          <el-segmented v-else-if="durations.length <= 5" v-model="data.duration" :options="durationOptions" block aria-label="视频时长" />
          <el-select v-else v-model="data.duration" :options="durationOptions" aria-label="视频时长" />
        </template>
        <template v-if="resolutions.length">
          <div class="fieldLabel">分辨率</div>
          <el-segmented v-model="data.resolution" :options="resolutions" block aria-label="视频分辨率" />
        </template>
        <div v-if="selectedModel.audio === 'optional'" class="audioOption">
          <span class="audioText"><icon-volume :size="16" aria-hidden="true" />生成音频</span>
          <el-switch v-model="data.generateAudio" aria-label="生成音频" />
        </div>
        <modelForm v-model="data.other" :rules="selectedModel.rules" />
      </template>
    </template>

    <template #actions>
      <div class="priceRow">
        <span>预估费用</span>
        <mediaPrice v-if="generationInput" :input="{ ...generationInput, mediaType: 'video' }" :supported="selectedModel?.supportsPrice === true" />
      </div>
      <el-button
        class="generateButton"
        type="primary"
        size="large"
        :icon="IconSparkles"
        :loading="submitting"
        :disabled="!!uploading || importing || !selectedModel || !data.prompt.trim() || !history.loaded"
        @click="startGeneration">
        生成视频
      </el-button>
    </template>

    <template #resultExtra>
      <template v-if="activeRecord">
        <span v-if="activeRecord.items.some(item => item.status === 'pending')" class="generatingTag" role="status"><el-icon class="is-loading"><icon-loader-2 /></el-icon>生成中，通常需要几分钟</span>
        <el-button size="small" round :icon="IconArrowBackUp" @click="fillRecord(activeRecord)">回填参数</el-button>
      </template>
    </template>

    <template #results>
      <template v-if="activeRecord">
        <p class="recordPrompt">{{ activeRecord.prompt }}</p>
        <div class="resultGrid">
          <template v-for="(item, index) in activeRecord.items" :key="index">
            <article v-if="item.status !== 'completed'" class="taskCard" :class="{ failed: item.status === 'failed' }" :aria-busy="item.status === 'pending'">
              <template v-if="item.status === 'failed'">
                <icon-alert-circle :size="28" aria-hidden="true" />
                <p class="taskTitle">生成失败</p>
                <p class="taskError" role="alert">{{ item.error }}</p>
                <el-button size="small" round :icon="IconRefresh" @click="retry(activeRecord, item)">重试</el-button>
              </template>
              <template v-else>
                <span class="taskShine" aria-hidden="true" />
                <icon-loader-2 class="spinIcon" :size="28" aria-hidden="true" />
                <p class="taskTitle">{{ item.taskId ? "视频生成中，关闭应用后也会继续，回来自动领取" : "正在提交…" }}</p>
              </template>
            </article>
            <videoCard v-for="path in item.files" v-else :key="path" :directory="directory" :path="path" :name="path.split('/').at(-1)!" />
          </template>
        </div>
      </template>
    </template>
  </workbenchLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref, shallowRef, watch } from "vue";
import axios from "axios";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconAlertCircle, IconArrowBackUp, IconLoader2, IconRefresh, IconSparkles, IconVolume } from "@tabler/icons-vue";
import { useNodeAi, type NodeMediaModel, type NodeVideoRequest } from "@toonflow/nodes-scaffold/nodeAi";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import { pickModel } from "@toonflow/node-shared/pickModel";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import { useModelForm } from "@toonflow/node-shared/useModelForm";
import modelOption from "@toonflow/node-shared/modelOption";
import modelForm from "@toonflow/node-shared/modelForm";
import mediaPrice from "@toonflow/node-shared/mediaPrice";
import promptLibrary from "@toonflow/node-shared/promptLibrary";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import workbenchLayout from "@/components/workbenchLayout.vue";
import historyList from "@/components/historyList.vue";
import referenceList, { type ReferenceFile } from "@/components/referenceList.vue";
import ratioPicker from "@/components/ratioPicker.vue";
import { outputDirectory, removeRecord, retryItem, submitRecord, useHistory, type HistoryItem, type HistoryRecord } from "@/stores/workbenchHistory";
import { importReferenceImages, mediaKind, type MediaKind } from "@/pages/imageStudio/studioFiles";
import frameSlot from "./frameSlot.vue";
import videoCard from "./videoCard.vue";

type FrameKey = "first" | "last";
type Tab = "text" | "frames" | "reference";

const props = defineProps<{ directory: string }>();
const frameDirectory = "frames";
// ACT: 后台未配置 meta.ratios 时沿用通用比例，与视频生成节点一致，具体支持范围由云端校验。
const defaultRatios = ["16:9", "9:16", "1:1"];
const frameModes = ["singleImage", "startEndRequired", "endFrameOptional", "startFrameOptional"];
const kindNames: Record<MediaKind, string> = { image: "图", video: "视频", audio: "音频" };
const ai = useNodeAi();
provide("workspaceDirectory", () => props.directory);
const data = ref({
  model: "", tab: "text" as Tab, prompt: "", duration: undefined as number | undefined, resolution: "", ratio: "9:16", generateAudio: true, other: {} as Record<string, unknown>,
  firstFrame: undefined as ReferenceFile | undefined, lastFrame: undefined as ReferenceFile | undefined, references: [] as ReferenceFile[],
});
const models = shallowRef<NodeMediaModel[]>([]);
const modelsLoading = ref(false);
const uploading = ref<FrameKey>();
const importing = ref(false);
const submitting = ref(false);
const activeId = ref<string>();
const history = computed(() => useHistory("video", props.directory));
const activeRecord = computed(() => history.value.records.find(item => item.id === activeId.value) ?? history.value.records[0]);
const activeFiles = computed(() => activeRecord.value?.items.flatMap(item => item.files) ?? []);

const modelKey = (item: NodeMediaModel) => JSON.stringify([item.providerId, item.modelId]);
const selectedModel = computed(() => models.value.find(item => modelKey(item) === data.value.model));
useModelForm(data, selectedModel);
const modelGroups = computed(() => groupNodeModels(models.value));
const ratios = computed(() => selectedModel.value?.ratios?.length ? selectedModel.value.ratios : defaultRatios);
const durations = computed(() => [...new Set((selectedModel.value?.durationResolutionMap ?? []).flatMap(item => item.duration))].sort((a, b) => a - b));
const durationOptions = computed(() => durations.value.map(item => ({ label: `${item}秒`, value: item })));
// 档位超过 5 个且是连续整数秒时，改用滑块加输入框自定义秒数；不连续的用下拉，避免输入到不支持的秒数。
const durationRange = computed(() => {
  const list = durations.value;
  const min = list[0]!, max = list.at(-1)!;
  return list.length > 5 && list.every((item, index) => item === min + index) ? { min, max } : undefined;
});
const resolutions = computed(() => [...new Set((selectedModel.value?.durationResolutionMap ?? [])
  .filter(item => data.value.duration !== undefined && item.duration.includes(data.value.duration)).flatMap(item => item.resolution))]
  .sort((left, right) => (Number.parseFloat(left) || Infinity) - (Number.parseFloat(right) || Infinity)));

// 生成方式按模型 mode 显示：字符串是文生与首尾帧，数组是全能参考的一组上限（如 ["imageReference:9","audioReference:3"]）。
const modes = computed(() => (selectedModel.value?.mode ?? []).filter((item): item is string => typeof item === "string"));
const referenceGroups = computed(() => (selectedModel.value?.mode ?? []).filter((item): item is string[] => Array.isArray(item))
  .map(group => Object.fromEntries(group.flatMap(item => {
    const [, type, limit] = /^(image|video|audio)Reference:(\d+)$/.exec(item) ?? [];
    return type ? [[type, Number(limit)]] : [];
  })) as Partial<Record<MediaKind, number>>));
const modeOptions = computed(() => [
  ...modes.value.includes("text") ? [{ label: "文生视频", value: "text" }] : [],
  ...modes.value.some(item => frameModes.includes(item)) ? [{ label: "首尾帧", value: "frames" }] : [],
  ...referenceGroups.value.length ? [{ label: "全能参考", value: "reference" }] : [],
]);
const frameSupport = computed(() => ({
  first: modes.value.some(item => frameModes.includes(item)),
  last: modes.value.some(item => ["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(item)),
}));
const frameHint = computed(() => modes.value.includes("startEndRequired") && !modes.value.some(item => ["endFrameOptional", "startFrameOptional"].includes(item))
  ? "首帧和尾帧都需要上传" : frameSupport.value.last ? "上传首帧，尾帧可选" : "上传一张首帧图");
// 多组上限时取各类型的最大值显示，提交时再找一组能容纳已选数量的。
const referenceLimits = computed(() => {
  const limits: Partial<Record<MediaKind, number>> = {};
  for (const group of referenceGroups.value) for (const [type, limit] of Object.entries(group) as [MediaKind, number][]) limits[type] = Math.max(limits[type] ?? 0, limit);
  return limits;
});
const referenceKinds = computed(() => (["image", "video", "audio"] as MediaKind[]).filter(kind => referenceLimits.value[kind]));
const referenceCounts = computed(() => Object.fromEntries((["image", "video", "audio"] as MediaKind[])
  .map(kind => [kind, data.value.references.filter(item => mediaKind(item.mimeType) === kind).length])) as Record<MediaKind, number>);
const referenceHint = computed(() => referenceKinds.value.map(kind => `${kind === "image" ? "图片" : kind === "video" ? "视频" : "音频"} ${referenceCounts.value[kind]}/${referenceLimits.value[kind]}`).join(" · "));

const selectedMode = computed((): NodeVideoRequest["mode"] => {
  if (data.value.tab === "reference") {
    const counts = referenceCounts.value;
    if (!counts.image && !counts.video && !counts.audio) return;
    const index = referenceGroups.value.findIndex(group => (Object.keys(counts) as MediaKind[]).every(kind => counts[kind] <= (group[kind] ?? 0)));
    return index < 0 ? undefined : (selectedModel.value?.mode ?? []).filter(item => Array.isArray(item))[index] as NodeVideoRequest["mode"];
  }
  const first = data.value.tab === "frames" && frameSupport.value.first ? data.value.firstFrame : undefined;
  const last = data.value.tab === "frames" && frameSupport.value.last ? data.value.lastFrame : undefined;
  const candidates = first && last ? ["startEndRequired", "endFrameOptional", "startFrameOptional"]
    : first ? ["endFrameOptional", "singleImage"] : last ? ["startFrameOptional"] : ["text"];
  return candidates.find(item => modes.value.includes(item)) as NodeVideoRequest["mode"];
});
const generationInput = computed((): Omit<NodeVideoRequest, "directory"> | undefined => {
  const choice = selectedModel.value;
  if (!choice) return;
  const mode = selectedMode.value;
  const text = data.value.prompt.trim();
  const base = {
    providerId: choice.providerId,
    modelId: choice.modelId,
    mode,
    duration: data.value.duration,
    resolution: data.value.resolution || undefined,
    ratio: data.value.ratio,
    generateAudio: choice.audio === "optional" ? data.value.generateAudio : choice.audio,
    other: Object.keys(data.value.other).length ? { ...data.value.other } : undefined,
    outputDirectory,
  };
  if (Array.isArray(mode)) {
    const pick = (kind: MediaKind) => data.value.references.filter(item => mediaKind(item.mimeType) === kind).map(item => ({ ...item }));
    const [images, videos, audios] = [pick("image"), pick("video"), pick("audio")];
    // 在提示词前说明素材编号，让模型能对应“图1”“视频1”“音频1”的引用。
    const labels = [...images.map((_item, index) => `${kindNames.image}${index + 1}`), ...videos.map((_item, index) => `${kindNames.video}${index + 1}`), ...audios.map((_item, index) => `${kindNames.audio}${index + 1}`)];
    return {
      ...base, prompt: text && `参考素材编号：${labels.join("、")}。请按这些编号理解提示词中的素材引用。\n${text}`,
      images: images.length ? images : undefined, videos: videos.length ? videos : undefined, audios: audios.length ? audios : undefined,
    };
  }
  const first = mode && mode !== "text" ? data.value.firstFrame : undefined;
  const last = mode && mode !== "text" && mode !== "singleImage" ? data.value.lastFrame : undefined;
  return {
    ...base, prompt: text,
    images: mode === "singleImage" && first ? [{ ...first }] : undefined,
    firstFrame: mode === "singleImage" || !first ? undefined : { ...first },
    lastFrame: last && { ...last },
  };
});

// 参数归一化与视频生成节点一致：切换模型或时长后回落到第一个可用值。
watch([selectedModel, () => data.value.duration], ([choice]) => {
  if (!choice) return;
  if (!durations.value.includes(data.value.duration!)) data.value.duration = durations.value[0];
  if (!resolutions.value.includes(data.value.resolution)) data.value.resolution = resolutions.value[0] ?? "";
  if (!ratios.value.includes(data.value.ratio)) data.value.ratio = ratios.value.includes("9:16") ? "9:16" : ratios.value[0]!;
  if (choice.audio !== "optional") data.value.generateAudio = choice.audio === true;
  if (!modeOptions.value.some(item => item.value === data.value.tab)) data.value.tab = (modeOptions.value[0]?.value ?? "text") as Tab;
}, { flush: "sync" });

// 首尾帧与参考素材是所选文件夹里的相对路径，切换文件夹后清空。
watch(() => props.directory, () => {
  Object.assign(data.value, { firstFrame: undefined, lastFrame: undefined, references: [] });
  activeId.value = undefined;
});
onMounted(() => void loadModels());

async function loadModels() {
  if (modelsLoading.value) return;
  modelsLoading.value = true;
  try {
    models.value = (await ai.getMediaModels()).filter(item => item.type === "video");
    data.value.model = pickModel(models.value, data.value.model);
  } catch (error) {
    showNodeError(error, "模型读取失败");
  } finally {
    modelsLoading.value = false;
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
    data.value[key === "first" ? "firstFrame" : "lastFrame"] = { path, mimeType: file.type };
  } catch (error) {
    showNodeError(error, "上传失败");
  } finally {
    uploading.value = undefined;
  }
}

// 填入提示词，并把提示词自带的参考图下载到 references：模型支持全能参考时切到全能参考追加图片，
// 否则按顺序放进首帧、尾帧；超出上限或模型不支持的不添加。
async function usePrompt(text: string, urls: string[]) {
  data.value.prompt = text;
  if (!urls.length) return;
  const imageLimit = referenceLimits.value.image ?? 0;
  const frameLimit = frameSupport.value.last ? 2 : frameSupport.value.first ? 1 : 0;
  if (!imageLimit && !frameLimit) return void ElMessage.warning("当前模型不支持参考图，只填入了提示词");
  const directory = props.directory;
  importing.value = true;
  try {
    const { images, failed } = await importReferenceImages(directory, urls);
    if (directory !== props.directory) return;
    let added = 0;
    if (imageLimit) {
      data.value.tab = "reference";
      for (const image of images) {
        if (data.value.references.some(item => item.path === image.path) || referenceCounts.value.image >= imageLimit) continue;
        data.value.references.push(image);
        added++;
      }
    } else if (images.length) {
      data.value.tab = "frames";
      [data.value.firstFrame, data.value.lastFrame] = [images[0], frameLimit > 1 ? images[1] : undefined];
      added = Math.min(images.length, frameLimit);
    }
    const skipped = images.length - added;
    if (failed || skipped) ElMessage.warning([failed && `${failed} 张参考图下载失败（境外图源需在设置 → 网络设置中配置代理）`, skipped && `${skipped} 张超出模型上限未添加`].filter(Boolean).join("，"));
  } finally {
    importing.value = false;
  }
}

async function startGeneration() {
  const input = generationInput.value;
  if (!input) return void showNodeError("请先选择视频模型", "视频生成失败");
  if (!input.prompt) return void showNodeError("请输入生成提示词", "视频生成失败");
  if (data.value.tab === "reference" && !data.value.references.length) return void showNodeError("请至少添加一个参考素材", "视频生成失败");
  if (modes.value.length + referenceGroups.value.length && !input.mode) {
    return void showNodeError(data.value.tab === "reference" ? "当前模型不支持这种参考素材组合，请调整素材数量" : "当前模型不支持这种首尾帧组合，请调整首尾帧或更换模型", "视频生成失败");
  }
  submitting.value = true;
  try {
    const { model, tab, firstFrame, lastFrame, references } = data.value;
    const record = await submitRecord("video", props.directory, data.value.prompt.trim(), input, { model, tab, firstFrame, lastFrame, references }, 1);
    activeId.value = record.id;
  } catch (error) {
    showNodeError(error, "视频生成失败");
  } finally {
    submitting.value = false;
  }
}

// 回填提示词、模型、生成方式与素材；素材文件已删除时生成会提示读取失败。
function fillRecord(record: HistoryRecord) {
  const input = record.input as Partial<NodeVideoRequest>;
  const saved = (record.form ?? {}) as Partial<Pick<typeof data.value, "model" | "tab" | "firstFrame" | "lastFrame" | "references">>;
  if (saved.model && models.value.some(item => modelKey(item) === saved.model)) data.value.model = saved.model;
  Object.assign(data.value, {
    prompt: record.prompt, other: { ...input.other }, firstFrame: saved.firstFrame, lastFrame: saved.lastFrame, references: [...saved.references ?? []],
  });
  if (input.duration) data.value.duration = input.duration;
  if (input.resolution) data.value.resolution = input.resolution;
  if (input.ratio) data.value.ratio = input.ratio;
  if (typeof input.generateAudio === "boolean") data.value.generateAudio = input.generateAudio;
  if (saved.tab && modeOptions.value.some(item => item.value === saved.tab)) data.value.tab = saved.tab;
  ElMessage.success("已回填这条记录的参数");
}

async function retry(record: HistoryRecord, item: HistoryItem) {
  try {
    await retryItem("video", props.directory, record, item);
  } catch (error) {
    showNodeError(error, "重试失败");
  }
}

async function removeHistory(record: HistoryRecord) {
  const pending = record.items.some(item => item.status === "pending");
  try {
    await ElMessageBox.confirm(pending ? "这条记录还在生成中，删除后结果不会再写入记录（云端仍会扣费）。生成的视频文件保留在文件夹里。" : "只删除记录，已生成的视频文件保留在文件夹里。", "删除生成记录", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" });
  } catch { return; }
  try {
    await removeRecord("video", props.directory, record.id);
  } catch (error) {
    showNodeError(error, "删除记录失败");
  }
}
</script>

<style lang="scss" scoped>
.videoWorkbench {
  .promptInput :deep(.el-textarea__inner) { padding: 10px 12px; line-height: 1.7; }


  .recordPrompt {
    margin: 0 0 14px;
    color: var(--el-text-color-regular);
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
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
  }
  .frameRow { display: flex; gap: 10px; }

  .durationRange {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-left: 8px;

    .el-slider { flex: 1; }
    .el-input-number { width: 96px; }
  }

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
