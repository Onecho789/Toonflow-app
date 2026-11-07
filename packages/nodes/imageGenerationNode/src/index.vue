<template>
  <nodeSkeleton
    v-bind="nodeProps"
    v-model:bottomVisible="node.selected"
    :topVisible="node.selected && !resultsExpanded"
    topWidth="max-content"
    :downloadUrl="previewUrl"
    :downloadName="outputFile?.url.split(/[\\/]/).at(-1)"
    @fullscreen="openPreview"
    :bottomWidth="660"
    :stackLayers="editor?.mode || resultsExpanded ? 0 : Math.max(0, resultCount - 1)"
    :style="{ width: (previewUrl || inpaintGuideUrl) && imageWidth ? `${imageWidth + 18}px` : undefined }">
    <template v-if="editor?.mode" #top><div ref="paintToolbar" /></template>
    <template v-if="data.prompt.trim()" #menuItems>
      <el-dropdown-item :icon="IconPencil" @click="renameByPrompt(node.data, data.prompt)">按提示词重命名</el-dropdown-item>
    </template>
    <template #topActions>
      <span class="toolbarGroup" :class="{ iconOnly: !showLabels }">
        <el-button v-if="visible('panorama')" class="panoramaButton" :icon="IconPanoramaHorizontal" :disabled="generating || deleting || uploading || editor?.busy || lighting?.generating || multiAngle?.generating || gridSplit?.splitting || panorama?.busy || !previewUrl" text title="全景图" aria-label="全景图" @click.stop="panorama?.open($event)">全景图<icon-chevron-down class="menuChevron" :size="14" /></el-button>
        <el-button v-if="visible('inpaint')" :icon="IconBrush" :disabled="generating || deleting || uploading || lighting?.generating || multiAngle?.generating || panorama?.busy || !previewUrl || gridSplit?.splitting" text title="局部重绘" aria-label="局部重绘" @click.stop="startEditor('inpaint')">局部重绘</el-button>
        <el-button v-if="visible('lighting')" :icon="IconSun" :disabled="generating || deleting || uploading || lighting?.generating || multiAngle?.generating || panorama?.busy || !previewUrl || gridSplit?.splitting" text title="打光" aria-label="打光" @click.stop="openLighting">打光</el-button>
        <el-button v-if="visible('multiAngle')" :icon="IconCameraRotate" :disabled="generating || deleting || uploading || lighting?.generating || multiAngle?.generating || panorama?.busy || !previewUrl || gridSplit?.splitting" text title="多角度" aria-label="多角度" @click.stop="openMultiAngle">多角度</el-button>
        <el-button v-if="visible('gridSplit')" :icon="IconLayoutGrid" :disabled="generating || deleting || uploading || lighting?.generating || multiAngle?.generating || panorama?.busy || !previewUrl" :loading="gridSplit?.splitting" text title="宫格切分" aria-label="宫格切分" @click.stop="gridSplit?.open($event)">宫格切分</el-button>
        <el-button v-if="visible('splitNodes')" :icon="IconArrowsSplit2" :disabled="generating || deleting || uploading || !outputFile" text title="拆分为图片节点" aria-label="拆分为图片节点" @click.stop="splitResults(data.results?.length ? data.results : outputFile ? [outputFile] : [])">拆分为节点</el-button>
        <copyPrompt v-if="visible('copyPrompt')" :text="data.prompt" />
        <mediaHistory ref="history" :hideTrigger="!visible('history')" mediaType="image" :current="outputFile" :disabled="generating || deleting || uploading || lighting?.generating || multiAngle?.generating || panorama?.busy" @select="outputs.image = { dataType: 'IMAGE', value: $event }" />
        <el-button v-if="visible('replace')" :icon="IconTransfer" :loading="uploading" :disabled="generating || deleting || lighting?.generating || multiAngle?.generating || panorama?.busy" text title="替换图片" aria-label="替换图片" @click.stop="fileInput?.click()">替换图片</el-button>
        <imageTools ref="tools" :src="previewUrl" :source="outputFile" :prompt="data.prompt" :active="node.selected" :tools="toolIds" @command="runTool" :disabled="generating || deleting || uploading || editor?.busy || lighting?.generating || multiAngle?.generating || panorama?.busy || gridSplit?.splitting" />
        <input ref="fileInput" type="file" accept="image/*" hidden aria-label="选择替换图片" :disabled="generating || deleting || uploading || lighting?.generating || multiAngle?.generating || panorama?.busy" @change="replaceOutput" />
      </span>
    </template>
    <template #topRightActions>
      <el-button v-if="visible('mark')" :icon="IconPencil" :disabled="generating || deleting || uploading || lighting?.generating || multiAngle?.generating || panorama?.busy || !previewUrl || gridSplit?.splitting" text title="标记" aria-label="标记" @click.stop="startEditor('mark')" />
    </template>
    <div v-loading="generating || uploading" class="imageContent nopan" :aria-busy="generating || uploading" @dblclick.stop="openPreview">
      <imageEditor
        v-if="previewUrl"
        ref="editor"
        :src="previewUrl"
        :toolbarTarget="paintToolbar"
        :disabled="generating || deleting || uploading || lighting?.generating || multiAngle?.generating || panorama?.busy"
        alt="生成图片"
        @load="resizeImage"
        @error="showNodeError('无法预览该图片', '图片预览失败')" />
      <div v-else-if="inpaintGuideUrl" class="inpaintGuide">
        <img :src="inpaintGuideUrl" alt="局部重绘标注图" draggable="false" @load="resizeImage" @error="showNodeError('无法读取重绘标注图', '重绘标注读取失败')" />
        <span>红色标注为重绘区域</span>
      </div>
      <div v-else class="imageEmpty" role="img" aria-label="暂无生成图片">
        <icon-photo-ai :size="48" stroke="1.25" aria-hidden="true" />
      </div>
      <button
        v-if="resultCount > 1 && !editor?.mode"
        type="button"
        class="stackBadge nodrag nopan"
        :aria-expanded="resultsExpanded"
        :aria-label="resultsExpanded ? '收起批量结果' : `展开 ${resultCount} 张批量结果`"
        @click.stop="resultsExpanded = !resultsExpanded"
        @dblclick.stop>
        <span>{{ resultCount }} 张</span>
        <icon-chevron-right class="stackChevron" :size="16" aria-hidden="true" />
      </button>
      <button
        v-if="resultCount > 1 && !editor?.mode"
        type="button"
        class="zipBadge nodrag nopan"
        :disabled="zipping || downloading || deleting"
        :aria-busy="zipping"
        :aria-label="`打包下载 ${resultCount} 张图片`"
        title="打包下载全部图片"
        @click.stop="downloadAllResults"
        @dblclick.stop>
        <icon-loader2 v-if="zipping" class="zipSpin" :size="16" aria-hidden="true" />
        <icon-file-zip v-else :size="16" aria-hidden="true" />
        <span>打包下载</span>
      </button>
      <generationStatus :status="generationState.status.value" :error="generationState.error.value" :canRetry="generationState.canRetry.value" :disabled="deleting || uploading" :resumed="resumed" @retry="retryGeneration" />
    </div>
    <template v-if="resultsExpanded && resultCount > 1 && !editor?.mode" #aside>
      <mediaResults
        :items="data.results!"
        mediaType="image"
        :current="outputFile"
        :disabled="generating || deleting || uploading"
        :downloadDisabled="zipping || downloading"
        @select="outputs.image = { dataType: 'IMAGE', value: $event }"
        @duplicate="duplicateResult"
        @preview="previewResult"
        @download="downloadSingleResult"
        @close="resultsExpanded = false" />
    </template>
    <template v-if="editor?.mode !== 'mark'" #bottom>
      <div v-if="lightingVisible" ref="lightingTarget" />
      <div v-else-if="multiAngleVisible" ref="multiAngleTarget" />
      <el-card v-else class="promptCard" shadow="never" :bodyStyle="{ padding: '14px 16px 12px' }">
        <el-button v-if="inpaintGuideUrl && editor?.mode !== 'inpaint'" class="inpaintInfo" text :icon="IconBrush" @click="inpaintPreviewVisible = true">查看重绘标注</el-button>
        <referenceItem
          v-if="refList.length"
          v-model="refList"
          @preview="setReferencePreview"
          @remove="removeReference" />
        <promptInput v-if="editor?.mode === 'inpaint'" v-model="data.inpaintPromptModel" v-model:text="data.inpaintPrompt" :references="referenceMentions" :materials="materialMentions" :selectMaterial="selectMaterialReference" :selectAsset="selectAssetReference" expandable />
        <promptInput v-else v-model="data.promptModel" v-model:text="data.prompt" :references="referenceMentions" :materials="materialMentions" :selectMaterial="selectMaterialReference" :selectAsset="selectAssetReference" expandable />
        <div class="promptFooter">
          <el-select
            v-if="editor?.mode !== 'inpaint'"
            v-model="data.model"
            class="modelSelect"
            filterable
            :loading="modelsLoading"
            :disabled="generating || deleting"
            placeholder="选择模型"
            aria-label="生成模型"
            noDataText="请先在设置中添加图片模型"
            placement="top-start"
            @visible-change="(visible) => visible && loadModels().catch((error) => showNodeError(error, '模型读取失败'))">
            <template #prefix><modelOption v-if="selectedModel" :model="selectedModel" iconOnly :size="17" /><icon-sparkles v-else :size="17" /></template>
            <el-option-group v-for="provider in modelGroups" :key="provider.id" :label="provider.label">
              <el-option
                v-for="item in provider.models"
                :key="item.modelId"
                :label="item.label"
                :value="JSON.stringify([item.providerId, item.modelId])">
                <modelOption :model="item" />
              </el-option>
            </el-option-group>
          </el-select>
          <generationSettings
            v-if="editor?.mode !== 'inpaint'"
            v-model:size="data.size"
            v-model:ratio="data.ratio"
            v-model:other="data.other"
            v-model:count="data.count"
            v-model:autoSplit="data.autoSplit"
            v-model:quality="data.quality"
            v-model:transparent="data.transparent"
            v-model:pixels="data.pixels"
            v-model:gif="data.gif"
            v-model:gifFrames="data.gifFrames"
            v-model:gifFrameDuration="data.gifFrameDuration"
            :maxCount="maxCount"
            :model="selectedModel"
            :sizes="sizeOptions"
            :ratios="ratioOptions"
            :disabled="generating || deleting || !selectedModel"
            @open="reloadModelsOnOpen" />
          <promptLibrary v-if="editor?.mode !== 'inpaint'" type="image" :disabled="generating || deleting" @select="setPromptText" />
          <el-button v-if="editor?.mode === 'inpaint'" class="confirmButton" type="primary" :icon="IconCheck" :loading="editor.busy" :disabled="deleting || uploading || !generationPrompt" @click="confirmInpaint().catch(error => showNodeError(error, '重绘节点创建失败'))">确认</el-button>
          <div v-else class="generationActions">
            <mediaPrice v-if="priceInput" :input="{ ...priceInput, mediaType: 'image' }" :supported="selectedModel?.supportsPrice === true" />
            <el-button
              class="sendButton"
              :icon="generating ? IconPlayerStop : IconArrowUp"
              :disabled="deleting || uploading || (!generating && (editor?.busy || !generationPrompt || !selectedModel))"
              :title="generating ? '停止生成' : '生成图片'"
              :aria-label="generating ? '停止生成' : '生成图片'"
              @click="generating ? generationController?.abort() : startGeneration().catch((error) => showNodeError(error, '图片生成失败'))" />
          </div>
        </div>
      </el-card>
    </template>
  </nodeSkeleton>
  <imageLighting v-if="lightingVisible" ref="lighting" :src="previewUrl" :source="outputFile" :target="lightingTarget" :disabled="generating || deleting || uploading || gridSplit?.splitting" @close="lightingVisible = false" />
  <imageMultiAngle v-if="multiAngleVisible" ref="multiAngle" :src="previewUrl" :source="outputFile" :target="multiAngleTarget" :disabled="generating || deleting || uploading || gridSplit?.splitting" @close="multiAngleVisible = false" />
  <imagePanorama ref="panorama" :src="previewUrl" :source="outputFile" :disabled="generating || deleting || uploading || editor?.busy || lighting?.generating || multiAngle?.generating || gridSplit?.splitting" @open="openPanorama" />
  <imageGridSplit ref="gridSplit" :src="previewUrl" :disabled="generating || deleting || uploading || lighting?.generating || multiAngle?.generating || panorama?.busy" :active="node.selected" />
  <el-image-viewer v-if="inpaintPreviewVisible && inpaintGuideUrl" :urlList="[inpaintGuideUrl]" teleported @close="inpaintPreviewVisible = false" />
  <mediaPreview v-model="canvasImages.visible.value" v-model:index="canvasImages.index.value" :items="canvasImages.items.value" @locate="canvasImages.locate" />
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, shallowRef, watch } from "vue";
import { ElButton, ElCard, ElSelect, ElOption, ElOptionGroup, ElLoading, ElImageViewer, ElDropdownItem } from "element-plus";
import { IconCheck, IconPhotoAi, IconSparkles, IconArrowUp, IconPlayerStop, IconTransfer, IconLayoutGrid, IconBrush, IconPencil, IconSun, IconCameraRotate, IconPanoramaHorizontal, IconChevronDown, IconChevronRight, IconArrowsSplit2, IconFileZip, IconLoader2 } from "@tabler/icons-vue";
import { isNodeModelsFresh, nodeSkeleton, nodeTools, useNode, z, type NodeMediaModel, type NodeImageRequest, type NodeImageResult, type NodeMediaValue, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import mediaPreview from "@toonflow/node-shared/mediaPreview";
import { useCanvasImages } from "@toonflow/node-shared/useCanvasImages";
import copyPrompt from "@toonflow/node-shared/copyPrompt";
import promptLibrary from "@toonflow/node-shared/promptLibrary";
import { promptModelOf } from "@toonflow/node-shared/cloudPrompts";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import { applyPromptLabel, renameByPrompt } from "@toonflow/node-shared/promptLabel";
import { useNodeGeneration } from "@toonflow/node-shared/useNodeGeneration";
import { useResultNodes } from "@toonflow/node-shared/useResultNodes";
import generationStatus from "@toonflow/node-shared/generationState";
import mediaResults from "@toonflow/node-shared/mediaResults";
import { downloadResult, downloadResults } from "@toonflow/node-shared/downloadResults";
import { useNodeReferences } from "@toonflow/node-shared/useNodeReferences";
import { useModelForm } from "@toonflow/node-shared/useModelForm";
import promptInput from "@toonflow/node-shared/promptInput";
import modelOption from "@toonflow/node-shared/modelOption";
import referenceItem from "@toonflow/node-shared/referenceItem";
import mediaHistory from "@toonflow/node-shared/mediaHistory";
import mediaPrice from "@toonflow/node-shared/mediaPrice";
import imageGridSplit from "@toonflow/node-image/imageGridSplit";
import imageEditor from "@toonflow/node-image/imageEditor";
import { buildInpaintRequest, useImageInpaint, type ImageInpaint } from "@toonflow/node-image/imageInpaint";
import imageLighting from "@toonflow/node-image/imageLighting";
import imagePanorama from "@toonflow/node-image/imagePanorama";
import imageMultiAngle from "@toonflow/node-image/imageMultiAngle";
import imageTools from "@toonflow/node-image/imageTools";
import { useImageToolbar, type ImageToolId } from "@toonflow/node-image/imageToolbar";
import generationSettings from "./components/generationSettings.vue";

defineOptions({
  inheritAttrs: false,
  icon: IconPhotoAi,
  handles: [
    { id: "in", type: "target", dataType: ["IMAGE", "STRING"], label: "图片、文本输入" },
    { id: "image", type: "source", dataType: "IMAGE", label: "图片输出" },
  ] satisfies NodeHandle[],
});
const vLoading = ElLoading.directive;
const { id, node, nodeProps, nodeEvent, outputs, files, ai, updateNodeInternals } = useNode({
  label: "图片生成",
});
type PromptModel = NonNullable<InstanceType<typeof promptInput>["$props"]["modelValue"]>;
const data = computed(() => node.data as { prompt: string; promptModel: PromptModel; inpaintPrompt: string; inpaintPromptModel: PromptModel; model: string; size: string; ratio: string; other: Record<string, unknown>; inpaint?: ImageInpaint; count: number; autoSplit: boolean; quality: string; transparent: boolean; pixels: string; gif: boolean; gifFrames: number; gifFrameDuration: number; results?: NodeMediaValue[] });
data.value.prompt ??= "";
data.value.promptModel ??= [];
data.value.inpaintPrompt ??= "";
data.value.inpaintPromptModel ??= [];
data.value.model ??= "";
data.value.size ??= "";
data.value.ratio ??= "16:9";
data.value.other ??= {};
data.value.count ??= 1;
data.value.autoSplit ??= false;
data.value.quality ??= "auto";
data.value.transparent ??= false;
data.value.pixels ??= "";
data.value.gif ??= false;
data.value.gifFrames ??= 9;
data.value.gifFrameDuration ??= 200;
type ImageInput = Omit<NodeImageRequest, "directory">;
const { refList, referenceMentions, materialMentions, selectMaterialReference, selectAssetReference, setReferencePreview, removeReference } = useNodeReferences();
const models = shallowRef<NodeMediaModel[]>([]);
const modelsLoading = ref(false);
const uploading = ref(false);
const tools = ref<InstanceType<typeof imageTools>>();
const fileInput = ref<HTMLInputElement>();
const gridSplit = ref<InstanceType<typeof imageGridSplit>>();
const editor = ref<InstanceType<typeof imageEditor>>();
const generateInpaint = useImageInpaint();
const paintToolbar = ref<HTMLElement>();
const lighting = ref<InstanceType<typeof imageLighting>>();
const lightingTarget = ref<HTMLElement>();
const lightingVisible = ref(false);
const multiAngle = ref<InstanceType<typeof imageMultiAngle>>();
const multiAngleTarget = ref<HTMLElement>();
const multiAngleVisible = ref(false);
const panorama = ref<InstanceType<typeof imagePanorama>>();
const history = ref<InstanceType<typeof mediaHistory>>();
const { visible, showLabels } = useImageToolbar();
const toolIds: ImageToolId[] = ["panorama", "inpaint", "lighting", "multiAngle", "gridSplit", "splitNodes", "copyPrompt", "history", "replace", "mark"];
let disposed = false;
const deleting = ref(false);
const resultsExpanded = ref(false);
const inpaintPreviewVisible = ref(false);
const imageWidth = ref(0);
let generationController: AbortController | undefined;
const generationState = useNodeGeneration(outputs, () => generationController?.abort());
const { generating } = generationState;
const resultNodes = useResultNodes("image");
const resumed = ref(false);
// 普通生成可恢复：卸载时不中止，任务留在服务端，下次打开节点继续领取；局部重绘卸载即停止。
let recoverable = false;
let generation: Promise<void> | undefined;
let modelsRequest: Promise<void> | undefined;
const selectedModel = computed(() => models.value.find((item) => JSON.stringify([item.providerId, item.modelId]) === data.value.model));
useModelForm(data, selectedModel);
const sizeOptions = computed(() => (selectedModel.value?.imageSizes?.length ? selectedModel.value.imageSizes : ["2K"]));
const ratioOptions = computed(() => (selectedModel.value?.imageRatios?.length ? selectedModel.value.imageRatios : ["16:9"]));
// ACT: 麦麦云单次最多 15 张（超过 8 张由云端拆批并行）；模型表单声明 n 字段上限时取更小值，局部重绘固定 1 张。
const maxCount = computed(() => {
  if (data.value.inpaint) return 1;
  const rule = selectedModel.value?.rules?.find(item => item?.field === "n") as { props?: { max?: unknown } } | undefined;
  const limit = Number(rule?.props?.max);
  return Number.isInteger(limit) && limit >= 1 ? Math.min(15, limit) : 15;
});
watch(maxCount, value => { if (data.value.count > value) data.value.count = value; }, { immediate: true });
watch(
  selectedModel,
  (choice) => {
    if (!choice) return;
    // ACT: 现有分辨率使用 K 单位；出现其他单位时再统一换算，未知名称排在数值选项之后。
    if (!sizeOptions.value.includes(data.value.size)) data.value.size = sizeOptions.value.toSorted((left, right) =>
      (Number.parseFloat(left) || Infinity) - (Number.parseFloat(right) || Infinity)
    )[0]!;
    if (!ratioOptions.value.includes(data.value.ratio)) data.value.ratio = ratioOptions.value.includes("16:9") ? "16:9" : ratioOptions.value[0]!;
  },
  { flush: "sync" }
);
const gifEnabled = computed(() => data.value.gif && selectedModel.value?.gif === true && !data.value.inpaint);
const modelGroups = computed(() => groupNodeModels(models.value));
const generationPrompt = computed(() =>
  [
    (editor.value?.mode === "inpaint" ? data.value.inpaintPrompt : data.value.prompt).trim(),
    ...refList.value.flatMap((item, index) => (item.dataType === "STRING" && item.value?.trim() ? [`参考 ${index + 1}：\n${item.value.trim()}`] : [])),
  ]
    .filter(Boolean)
    .join("\n\n")
);
const generationInput = computed<ImageInput | undefined>(() => {
  const choice = selectedModel.value;
  if (!choice) return;
  const inpaint = data.value.inpaint;
  const references = refList.value.filter(item => !inpaint || item.dataType !== "IMAGE" || item.value?.url !== inpaint.source);
  const input: ImageInput = {
    providerId: choice.providerId,
    modelId: choice.modelId,
    prompt: generationPrompt.value,
    size: data.value.size,
    ratio: data.value.ratio,
    other: imageOther(),
    outputDirectory: `assets/${id}`,
    images: references.flatMap(item => item.dataType === "IMAGE" && item.value ? [{ path: item.value.url, mimeType: item.value.mimeType }] : []),
  };
  if (!inpaint && data.value.count > 1) input.n = Math.min(data.value.count, maxCount.value);
  if (inpaint) {
    let imageIndex = 3 + (inpaint.images?.length ?? 0);
    const mapping = refList.value.flatMap((item, index) => item.dataType === "IMAGE" && item.value
      ? [`参考 ${index + 1} / {{ref ${index + 1}}} 对应第 ${item.value.url === inpaint.source ? 1 : imageIndex++} 张图`] : []);
    if (mapping.length) input.prompt += `\n当前节点参考编号对应关系：${mapping.join("；")}。`;
  }
  return input;
});
// 质量、透明背景、自定义像素单独存在节点数据里（换模型时 useModelForm 会重置 other），请求时并入 other 转发麦麦云。
function imageOther() {
  const other = {
    ...data.value.other,
    ...(data.value.quality && data.value.quality !== "auto" ? { quality: data.value.quality } : {}),
    ...(data.value.transparent ? { background: "transparent" } : {}),
    ...(data.value.pixels && !data.value.inpaint ? { pixels: data.value.pixels } : {}),
    // GIF 只用于普通文生图；带参考图时由麦麦云返回明确错误。
    ...(gifEnabled.value ? { output_format: "gif", frame_count: data.value.gifFrames, frame_duration_ms: data.value.gifFrameDuration } : {}),
  };
  return Object.keys(other).length ? other : undefined;
}
const priceInput = computed(() => {
  const input = generationInput.value;
  const inpaint = data.value.inpaint;
  if (!input || inpaint && !Array.isArray(inpaint.images)) return;
  return inpaint ? buildInpaintRequest(input, inpaint) : input;
});
const outputFile = computed(() => outputs.value.image?.dataType === "IMAGE" ? outputs.value.image.value : undefined);
// 当前输出属于本次批量结果时按叠卡展示，换成历史或替换图片后不再叠放。
const resultCount = computed(() => data.value.results && data.value.results.some(item => item.url === outputFile.value?.url) ? data.value.results.length : 0);
const inpaintGuideUrl = files.useFileUrl(
  () => data.value.inpaint?.guide ? { url: data.value.inpaint.guide, mimeType: "image/png" } : undefined,
  error => showNodeError(error, "重绘标注读取失败")
);
const previewUrl = files.useFileUrl(
  outputFile,
  (error) => showNodeError(error, "图片读取失败")
);
// 放大预览翻看当前画布全部图片，按生成时间从新到旧；只读当前张和相邻一张。
const canvasImages = useCanvasImages();

onMounted(() => {
  window.addEventListener("toonflow:plugin-installed", refreshProviderModels);
  window.addEventListener("toonflow:provider-config-changed", refreshProviderModels);
  void loadModels().catch(error => { if (!disposed) showNodeError(error, "模型读取失败"); });
  const saved = generationState.savedTask;
  if (saved?.taskId && generationState.status.value !== "failed") resumeGeneration(saved.taskId, saved.request as ImageInput);
});
onScopeDispose(() => {
  disposed = true;
  window.removeEventListener("toonflow:plugin-installed", refreshProviderModels);
  window.removeEventListener("toonflow:provider-config-changed", refreshProviderModels);
  if (!recoverable) generationController?.abort();
});
// 重启后的失败记录同样按原请求重试。
if (generationState.savedTask?.request) {
  const request = generationState.savedTask.request as ImageInput;
  generationState.setRetry(() => runRequest(request));
}

async function refreshProviderModels(event: Event) {
  if (event.type === "toonflow:plugin-installed" && (event as CustomEvent<{ type?: string }>).detail?.type !== "provider") return;
  try {
    await generation;
    if (!disposed && !deleting.value) await loadModels();
  } catch (error) {
    if (!disposed) showNodeError(error, "模型读取失败");
  }
}

async function replaceOutput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || generating.value || deleting.value || uploading.value || lighting.value?.generating || multiAngle.value?.generating || panorama.value?.busy || disposed) return;
  if (!file.type.startsWith("image/")) return void showNodeError("请选择图片文件", "图片替换失败");
  if (!file.size || file.size > 100 * 1024 * 1024) return void showNodeError("图片不能为空且不能超过 100 MB", "图片替换失败");
  uploading.value = true;
  try {
    const workspace = files.getWorkspaceFiles();
    const url = await files.uploadFile(file);
    if (disposed) {
      await workspace.remove(url);
      return;
    }
    // ACT: 保留历史输出文件，避免破坏撤销记录和复制节点的引用。
    outputs.value.image = { dataType: "IMAGE", value: { url, mimeType: file.type, createdAt: Date.now() } };
  } catch (error) {
    showNodeError(error, "图片替换失败");
  } finally {
    uploading.value = false;
  }
}

function loadModels() {
  if (modelsRequest) return modelsRequest;
  modelsLoading.value = true;
  modelsRequest = ai.getMediaModels().then((items) => {
    if (disposed || generating.value || deleting.value) return;
    models.value = items.filter((item) => item.type === "image");
    // ACT: 只给空配置选默认模型，保留暂时不可用的旧选择及其参数。
    if (!data.value.model) {
      const first = models.value[0];
      data.value.model = first ? JSON.stringify([first.providerId, first.modelId]) : "";
    }
  }).finally(() => {
    modelsLoading.value = false;
    modelsRequest = undefined;
  });
  return modelsRequest;
}

// 打开设置只在模型缓存过期时重读；失败时保留现有模型，不弹报错。
function reloadModelsOnOpen() {
  if (!isNodeModelsFresh("media")) loadModels().catch(() => {});
}

async function confirmInpaint() {
  const inpaintEditor = editor.value;
  if (!inpaintEditor || inpaintEditor.mode !== "inpaint") throw new Error("请先进入局部重绘");
  if (inpaintEditor.busy || generating.value || deleting.value || uploading.value) return;
  if (!generationPrompt.value) throw new Error("请输入重绘提示词");
  if (refList.value.some(item => item.value === undefined)) throw new Error("引用节点暂无内容，请先补充引用内容");
  let prompt = generationPrompt.value.replace(/\{\{ref (\d+)\}\}/g, "重绘参考 $1").replace(/^参考 (\d+)：/gm, "重绘参考 $1：");
  const images = refList.value.flatMap(item => item.dataType === "IMAGE" && item.value ? [{ path: item.value.url, mimeType: item.value.mimeType }] : []);
  const imageReferences = refList.value.flatMap((item, index) => item.dataType === "IMAGE" && item.value ? [index + 1] : []);
  if (imageReferences.length) prompt += `\n重绘参考编号对应关系（前两张为原图和区域引导图）：${imageReferences.map((reference, index) => `重绘参考 ${reference} 对应第 ${index + 3} 张图`).join("；")}。`;
  await inpaintEditor.createInpaint({ prompt, images }, new AbortController().signal);
}

function assertIdle() {
  if (generating.value) throw new Error("图片正在生成，请等待完成");
  if (panorama.value?.visible) throw new Error("请先关闭全景图，再启动图片生成");
  if (uploading.value) throw new Error("图片正在替换，请等待完成");
  if (deleting.value) throw new Error("节点正在删除");
  if (lightingVisible.value) throw new Error("请先退出打光，再启动图片生成");
  if (multiAngleVisible.value) throw new Error("请先退出多角度，再启动图片生成");
  if (editor.value?.busy || editor.value?.mode === "mark") throw new Error("请先完成图片标记");
  if (editor.value?.mode === "inpaint") throw new Error("请先确认局部重绘，再到子节点生成");
}

async function startGeneration() {
  const input = generationInput.value;
  assertIdle();
  if (!generationPrompt.value) throw new Error("请输入生成提示词");
  const references = refList.value.filter(item => !data.value.inpaint || item.dataType !== "IMAGE" || item.value?.url !== data.value.inpaint.source);
  if (references.some(item => item.value === undefined)) throw new Error("引用节点暂无内容，请先补充引用内容");
  if (!input) throw new Error("请先选择图片模型");
  const inpaintData = data.value.inpaint;
  applyPromptLabel(node.data, (inpaintData ? data.value.inpaintPrompt : "") || data.value.prompt, "图片生成");
  return inpaintData ? runInpaint(input, inpaintData) : runRequest(input);
}

// 以固定请求参数生成，失败后的重试与重启后的重试都走这里。
function runRequest(input: ImageInput): { status: string } {
  assertIdle();
  return launch((signal, workspace) => workspace.list().then(({ directory }) => {
    signal.throwIfAborted();
    return ai.generateImage({ ...input, directory }, signal, {
      onTask: taskId => generationState.track({ nodeId: id, taskId, mediaType: "image", startedAt: Date.now(), request: { ...input } }),
    });
  }), true, () => runRequest(input));
}

function runInpaint(input: ImageInput, inpaintData: ImageInpaint): { status: string } {
  assertIdle();
  return launch((signal, workspace) => workspace.list().then(({ directory }) => {
    signal.throwIfAborted();
    return generateInpaint({ ...input, directory }, inpaintData, signal);
  }), false, () => runInpaint(input, inpaintData));
}

// 重新打开节点时继续领取未完成的任务。
function resumeGeneration(taskId: string, request: ImageInput) {
  resumed.value = true;
  launch((signal, workspace) => workspace.list().then(({ directory }) => {
    signal.throwIfAborted();
    return ai.resumeMedia("image", directory, taskId, signal);
  }), true, () => runRequest(request));
}

// ACT: 工具立即返回，任务由节点持有；停止或删除时取消，可恢复任务在卸载时保留。
function launch(task: (signal: AbortSignal, workspace: ReturnType<typeof files.getWorkspaceFiles>) => Promise<NodeImageResult[]>, canRecover: boolean, retryWith: () => unknown): { status: string } {
  const workspace = files.getWorkspaceFiles();
  const controller = new AbortController();
  generationController = controller;
  recoverable = canRecover;
  generation = generationState.run(() => task(controller.signal, workspace).then((results) => {
    controller.signal.throwIfAborted();
    // 同一批结果共用完成时间，预览排序时再按结果顺序排列。
    const createdAt = Date.now();
    const items = results.map(result => ({ url: result.path, mimeType: result.mimeType, createdAt }));
    if (!items.length) throw new Error("供应商未返回图片");
    data.value.results = items;
    outputs.value.image = { dataType: "IMAGE", value: items[0]! };
    return items;
  }), retryWith)
    .then((items) => { if (data.value.autoSplit) splitResults(items); })
    .catch((error) => showNodeError(error, "图片生成失败"))
    .finally(() => {
      generationController = undefined;
      recoverable = false;
      resumed.value = false;
    });
  return { status: "generating" };
}

function retryGeneration() {
  Promise.resolve().then(() => generationState.retry()).catch(error => showNodeError(error, "图片生成失败"));
}

function splitResults(items: NodeMediaValue[]) {
  if (!items.length || deleting.value) return;
  resultNodes.split(items).catch(error => showNodeError(error, "拆分图片节点失败"));
}

function duplicateResult(item: NodeMediaValue) {
  if (deleting.value) return;
  resultNodes.duplicate(item).catch(error => showNodeError(error, "创建副本失败"));
}

const zipping = ref(false);
const downloading = ref(false);
async function downloadAllResults() {
  if (zipping.value || downloading.value || deleting.value || !data.value.results?.length) return;
  zipping.value = true;
  try {
    await downloadResults(files.getWorkspaceFiles(), data.value.results, nodeProps.value.label ?? "图片生成");
  } catch (error) {
    showNodeError(error, "打包下载失败");
  } finally {
    zipping.value = false;
  }
}

async function downloadSingleResult(item: NodeMediaValue, index: number) {
  if (downloading.value || zipping.value || generating.value || deleting.value || uploading.value) return;
  downloading.value = true;
  try {
    await downloadResult(files.getWorkspaceFiles(), item, `${nodeProps.value.label ?? "图片生成"}-${index + 1}`);
  } catch (error) {
    showNodeError(error, "图片下载失败");
  } finally {
    downloading.value = false;
  }
}

function previewResult(index: number) {
  const item = data.value.results?.[index];
  if (item) void canvasImages.open(id, item.url);
}

function openPreview() {
  if (!previewUrl.value || editor.value?.mode) return;
  void canvasImages.open(id, outputFile.value?.url);
}

nodeEvent.on("save", (reason) => {
  if (reason === "reload" && (generating.value || uploading.value || deleting.value || editor.value?.busy || lighting.value?.generating || multiAngle.value?.generating || panorama.value?.busy)) throw new Error("图片处理中，请完成后再刷新节点");
});
nodeEvent.on("delete", async () => {
  if (uploading.value || tools.value?.busy || lighting.value?.generating || multiAngle.value?.generating || panorama.value?.busy || (editor.value?.busy && !generating.value)) throw new Error("图片处理中，请稍后删除节点");
  deleting.value = true;
  generationController?.abort();
  try {
    await generation;
    await files.removeNodeFiles();
  } finally {
    deleting.value = false;
  }
});

async function resizeImage(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  if (!image.naturalWidth || !image.naturalHeight) return;
  imageWidth.value = (240 * image.naturalWidth) / image.naturalHeight;
  await nextTick();
  updateNodeInternals();
}

function openPanorama() {
  editor.value?.cancel();
  lightingVisible.value = false;
  multiAngleVisible.value = false;
}

// 工具栏中隐藏的节点工具从“更多”菜单回到这里执行
function runTool(id: ImageToolId, anchor: HTMLElement) {
  if (id === "panorama") void panorama.value?.open(anchor);
  else if (id === "inpaint" || id === "mark") startEditor(id);
  else if (id === "lighting") openLighting();
  else if (id === "multiAngle") openMultiAngle();
  else if (id === "gridSplit") gridSplit.value?.open(anchor);
  else if (id === "splitNodes") splitResults(data.value.results?.length ? data.value.results : outputFile.value ? [outputFile.value] : []);
  else if (id === "history") history.value?.open();
  else if (id === "replace") fileInput.value?.click();
}

function openLighting() {
  if (generating.value || deleting.value || uploading.value || editor.value?.busy || lighting.value?.generating || multiAngle.value?.generating || panorama.value?.busy || gridSplit.value?.splitting || !previewUrl.value) return;
  editor.value?.cancel();
  multiAngleVisible.value = false;
  lightingVisible.value = true;
}

function openMultiAngle() {
  if (generating.value || deleting.value || uploading.value || editor.value?.busy || lighting.value?.generating || multiAngle.value?.generating || panorama.value?.busy || gridSplit.value?.splitting || !previewUrl.value) return;
  editor.value?.cancel();
  lightingVisible.value = false;
  multiAngleVisible.value = true;
}

function startEditor(mode: "inpaint" | "mark") {
  if (generating.value || deleting.value || uploading.value || editor.value?.busy || lighting.value?.generating || multiAngle.value?.generating || panorama.value?.busy || gridSplit.value?.splitting) return;
  lightingVisible.value = false;
  multiAngleVisible.value = false;
  editor.value?.start(mode);
}

function getConfig() {
  return {
    config: {
      providerId: selectedModel.value?.providerId ?? "",
      modelId: selectedModel.value?.modelId ?? "",
      size: data.value.size,
      ratio: data.value.ratio,
      count: data.value.count,
      autoSplit: data.value.autoSplit,
      quality: data.value.quality,
      transparent: data.value.transparent,
      pixels: data.value.pixels,
      gif: data.value.gif,
      gifFrames: data.value.gifFrames,
      gifFrameDuration: data.value.gifFrameDuration,
      maxCount: maxCount.value,
      other: { ...data.value.other },
    },
    models: models.value,
  };
}

nodeTools.register({
  name: "getConfig",
  description: "读取此图片生成节点的当前模型、分辨率、比例及可选图片模型能力，不含密钥；未声明分辨率或比例时分别使用 2K、16:9",
  parameters: z.strictObject({}),
  async execute(_args, { signal }) {
    signal?.throwIfAborted();
    await loadModels();
    signal?.throwIfAborted();
    return getConfig();
  },
});

nodeTools.register({
  name: "setConfig",
  description: "修改此图片生成节点的模型、分辨率、比例、张数、质量（auto/high/medium/low）、透明背景、自定义像素（宽x高，16 的倍数，空串恢复档位）、GIF 动图（gif，仅 getConfig 模型 gif 为 true 时可开，只支持无参考图的文生图；gifFrames 2–16 帧，gifFrameDuration 每帧 20–2000 毫秒）或完成后是否拆分为图片节点；先用 getConfig 查询可选能力（张数不超过 maxCount），providerId 与 modelId 必须同时提供；不修改提示词、不启动生成",
  parameters: z.strictObject({
    providerId: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
    size: z.string().min(1).optional(),
    ratio: z.string().min(1).optional(),
    count: z.number().int().min(1).max(15).optional(),
    autoSplit: z.boolean().optional(),
    quality: z.enum(["auto", "high", "medium", "low"]).optional(),
    transparent: z.boolean().optional(),
    pixels: z.union([z.literal(""), z.string().regex(/^[1-9]\d{1,3}x[1-9]\d{1,3}$/)]).optional(),
    gif: z.boolean().optional(),
    gifFrames: z.number().int().min(2).max(16).optional(),
    gifFrameDuration: z.number().int().min(20).max(2000).optional(),
  }).refine((args) => (args.providerId === undefined) === (args.modelId === undefined), "providerId 与 modelId 必须同时提供"),
  async execute(args, { signal }) {
    signal?.throwIfAborted();
    if (generating.value || deleting.value) throw new Error("节点正在生成或删除，请稍后修改配置");
    await loadModels();
    signal?.throwIfAborted();
    if (generating.value || deleting.value) throw new Error("节点正在生成或删除，请稍后修改配置");
    const choice = args.modelId === undefined ? selectedModel.value
      : models.value.find((item) => item.providerId === args.providerId && item.modelId === args.modelId);
    if (!choice) throw new Error("请选择 getConfig 返回的有效图片模型");
    const sizes = choice.imageSizes?.length ? choice.imageSizes : ["2K"];
    const ratios = choice.imageRatios?.length ? choice.imageRatios : ["16:9"];
    if (args.size !== undefined && !sizes.includes(args.size)) throw new Error(`当前模型不支持分辨率 ${args.size}，可选：${sizes.join("、")}`);
    if (args.ratio !== undefined && !ratios.includes(args.ratio)) throw new Error(`当前模型不支持比例 ${args.ratio}，可选：${ratios.join("、")}`);
    if (args.gif && choice.gif !== true) throw new Error("当前模型不支持 GIF 动图");
    data.value.model = JSON.stringify([choice.providerId, choice.modelId]);
    if (args.size !== undefined) data.value.size = args.size;
    if (args.ratio !== undefined) data.value.ratio = args.ratio;
    if (args.count !== undefined) {
      if (args.count > maxCount.value) throw new Error(`当前模型单次最多生成 ${maxCount.value} 张`);
      data.value.count = args.count;
    }
    if (args.autoSplit !== undefined) data.value.autoSplit = args.autoSplit;
    if (args.quality !== undefined) data.value.quality = args.quality;
    if (args.transparent !== undefined) data.value.transparent = args.transparent;
    if (args.pixels !== undefined) data.value.pixels = args.pixels;
    if (args.gif !== undefined) data.value.gif = args.gif;
    if (args.gifFrames !== undefined) data.value.gifFrames = args.gifFrames;
    if (args.gifFrameDuration !== undefined) data.value.gifFrameDuration = args.gifFrameDuration;
    return getConfig();
  },
});

function setPromptText(value: string) {
  data.value.prompt = value;
  data.value.promptModel = promptModelOf(value);
}

nodeTools.register({
  name: "setPrompt",
  description: "修改此节点的普通图片生成提示词，支持 {{ref 1}} 等参考标记；不修改局部重绘提示词，不启动生成",
  parameters: z.strictObject({ prompt: z.string() }),
  execute({ prompt: value }) {
    if (deleting.value) throw new Error("节点正在删除，请稍后修改");
    setPromptText(value);
    return { prompt: value };
  },
});

nodeTools.register({
  name: "generateImage",
  description: "启动此节点的后台普通图片生成，使用普通生成提示词、模型、分辨率、比例和参考图片；局部重绘模式下须先退出；立即返回已开始，用 getGenerationStatus 查询完成结果，cancelGeneration 停止生成",
  parameters: z.strictObject({}),
  execute(_args, { signal }) {
    signal?.throwIfAborted();
    return startGeneration();
  },
});
</script>

<style scoped lang="scss">
.toolbarGroup {
  display: contents;

  &.iconOnly :deep(.el-button > span:not(.el-icon)) { display: none; }
}

.panoramaButton {
  &[aria-expanded="true"] .menuChevron { transform: rotate(180deg); }
}

@keyframes zipSpin {
  to { transform: rotate(360deg); }
}

.imageContent {
  .nodeSkeleton.resized & {
    height: 100%;
    min-height: 0;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);

    .inpaintGuide,
    .imageEmpty {
      height: 100%;
      min-height: 0;
    }

    .inpaintGuide img { height: 100%; object-fit: contain; }
  }

  position: relative;
  display: grid;
  place-items: center;
  min-height: 144px;
  overflow: hidden;
  border-radius: var(--el-border-radius-base);

  .inpaintGuide {
    position: relative;
    width: 100%;
    img { display: block; width: 100%; }
    span { position: absolute; bottom: 8px; left: 8px; padding: 4px 8px; border-radius: 4px; background: #0009; color: #fff; font-size: 12px; }
  }

  .imageEmpty {
    display: grid;
    place-items: center;
    min-height: 144px;
    color: var(--el-text-color-placeholder);
  }

  :deep(.el-loading-mask) {
    pointer-events: none;
  }

  .stackBadge {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 36px;
    padding: 0 12px 0 14px;
    border: 1px solid rgb(255 255 255 / 30%);
    border-radius: 999px;
    background: rgb(0 0 0 / 55%);
    color: #fff;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: background-color .15s;

    &:hover { background: rgb(0 0 0 / 70%); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    .stackChevron { transition: transform .2s; }
    &[aria-expanded="true"] .stackChevron { transform: rotate(90deg); }
  }

  /* 打包下载与张数徽标同排，悬停节点时出现。 */
  .zipBadge {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 36px;
    padding: 0 14px;
    border: 1px solid rgb(255 255 255 / 30%);
    border-radius: 999px;
    background: rgb(0 0 0 / 55%);
    color: #fff;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    opacity: 0;
    backdrop-filter: blur(8px);
    transition: opacity .15s, background-color .15s;

    &:hover { background: rgb(0 0 0 / 70%); }
    &:disabled { cursor: progress; }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    .zipSpin { animation: zipSpin 1s linear infinite; }
  }

  &:hover .zipBadge,
  .zipBadge:focus-visible,
  .zipBadge[aria-busy="true"] { opacity: 1; }

}

.promptCard {
  .inpaintInfo { margin-bottom: 8px; }
  .promptFooter {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;

    .modelSelect {
      width: 190px;
      min-width: 0;

      &:deep(.el-select__wrapper) {
        gap: 6px;
        padding: 0;
        box-shadow: none;
        background: transparent;
      }
    }

    .confirmButton { margin-left: auto; }

    .generationActions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;

      .sendButton {
        width: 32px;
        height: 32px;
        margin-left: 0;
        padding: 0;
        --el-button-bg-color: var(--el-text-color-primary);
        --el-button-border-color: transparent;
        --el-button-text-color: var(--el-bg-color);
        --el-button-hover-bg-color: var(--el-text-color-regular);
        --el-button-hover-border-color: transparent;
        --el-button-hover-text-color: var(--el-bg-color);
      }
    }
  }
}
</style>
