<template>
  <nodeSkeleton
    v-bind="nodeProps"
    v-model:bottomVisible="node.selected"
    :topVisible="node.selected"
    topWidth="max-content"
    :bottomWidth="520"
    :fullscreenVisible="false"
    :downloadUrl="exporting ? '' : resultUrl"
    :downloadName="resultFile?.url.split(/[\\/]/).at(-1)">
    <template #topActions>
      <el-button :icon="IconFileText" text size="small" :disabled="!clips.length || exporting" @click.stop="downloadEdl">导出 EDL</el-button>
      <el-button :icon="IconFileExport" text size="small" :disabled="!ready || exporting" @click.stop="run">合成导出</el-button>
    </template>
    <div class="timelineContent">
      <div v-if="!clips.length" class="emptyState">
        <icon-timeline :size="32" stroke="1.5" aria-hidden="true" />
        <span>把视频或图片节点连到左侧「画面片段」，在这里排成一条成片</span>
      </div>
      <div v-else class="trackRow nodrag nopan nowheel" @pointerdown.stop @dblclick.stop>
        <icon-movie class="trackIcon" :size="16" aria-label="画面轨" />
        <vue-draggable
          v-model="clips"
          class="clipTrack"
          aria-label="画面片段，拖动或按 Alt+左右方向键排序"
          :animation="180"
          direction="horizontal"
          ghostClass="clipGhost"
          :disabled="exporting">
          <button
            v-for="(clip, index) in clips"
            :key="clip.key"
            type="button"
            class="clipCard"
            :class="{ active: clip.key === selectedKey, missing: !clip.file }"
            :style="{ width: `${clipWidth(clip)}px` }"
            :aria-pressed="clip.key === selectedKey"
            :aria-label="`第 ${index + 1} 段 ${clip.label} ${formatSeconds(clipDuration(clip))}`"
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
            @click="selectedKey = clip.key"
            @keydown.alt.left.stop.prevent="moveClip(index, index - 1)"
            @keydown.alt.right.stop.prevent="moveClip(index, index + 1)">
            <clipThumb :file="clip.file" :kind="clip.kind" @duration="value => setMediaDuration(clip, value)" />
            <span class="clipMeta">
              <span class="clipIndex">{{ index + 1 }}</span>
              <span class="clipLabel">{{ clip.label }}</span>
              <span class="clipTime">{{ formatSeconds(clipDuration(clip)) }}</span>
            </span>
          </button>
        </vue-draggable>
      </div>
      <div class="trackRow audioRow">
        <icon-music class="trackIcon" :size="16" aria-label="配音/BGM 轨" />
        <div v-if="music.length" class="audioTrack">
          <span v-for="(item, index) in music" :key="`${item.source}|${item.sourceHandle}|${index}`" class="audioChip">{{ item.label }}</span>
        </div>
        <span v-else class="trackHint">连接音频节点到「配音/BGM」添加配乐</span>
      </div>
      <div class="statusRow">
        <span>共 {{ playable.length }} 段 · {{ formatSeconds(totalDuration) }}</span>
        <span v-if="skipped" class="trackHint">{{ skipped }} 段暂无素材，导出时跳过</span>
      </div>
      <div v-if="exporting" class="progressArea" role="status" aria-live="polite">
        <el-progress :percentage="progress" :strokeWidth="4" :showText="false" />
        <div class="progressFooter">
          <span>{{ cancelling ? '正在取消…' : `正在合成 · ${progress}%` }}</span>
          <el-button :icon="IconPlayerStop" size="small" :disabled="cancelling" @click.stop="cancel">取消</el-button>
        </div>
      </div>
      <div v-else-if="state.lastExport && resultFile?.url === state.lastExport.url" class="resultRow" role="status">
        <icon-circle-check :size="16" aria-hidden="true" />
        <span>已导出 {{ formatSeconds(state.lastExport.duration) }}，成片在右侧视频节点</span>
      </div>
    </div>
    <template #bottom>
      <el-card class="editorCard nodrag nopan nowheel" shadow="never" :bodyStyle="{ padding: '12px 14px' }" @pointerdown.stop @dblclick.stop>
        <template v-if="selected">
          <div class="editorTitle">
            <span>第 {{ clips.indexOf(selected) + 1 }} 段 · {{ selected.label }}</span>
            <span v-if="selected.shotDuration" class="trackHint">分镜 {{ formatSeconds(selected.shotDuration) }}</span>
          </div>
          <label v-if="selected.kind === 'IMAGE'" class="fieldRow">
            <span>时长（秒）</span>
            <el-input-number
              :modelValue="clipDuration(selected)"
              size="small"
              :min="0.1"
              :max="600"
              :step="0.5"
              :precision="2"
              controlsPosition="right"
              :disabled="exporting"
              aria-label="图片时长"
              @update:modelValue="value => updateClip(selected!, { duration: value ?? undefined })" />
          </label>
          <template v-else>
            <label class="fieldRow">
              <span>入点（秒）</span>
              <el-input-number
                :modelValue="selected.setting.start ?? 0"
                size="small"
                :min="0"
                :max="selected.mediaDuration ? Math.max(0, selected.mediaDuration - 0.1) : undefined"
                :step="0.1"
                :precision="2"
                controlsPosition="right"
                :disabled="exporting"
                aria-label="视频入点"
                @update:modelValue="value => updateClip(selected!, { start: value ?? 0 })" />
            </label>
            <label class="fieldRow">
              <span>出点（秒）</span>
              <el-input-number
                :modelValue="clipEnd(selected)"
                size="small"
                :min="(selected.setting.start ?? 0) + 0.1"
                :max="selected.mediaDuration"
                :step="0.1"
                :precision="2"
                controlsPosition="right"
                :disabled="exporting"
                placeholder="素材结尾"
                aria-label="视频出点"
                @update:modelValue="value => updateClip(selected!, { end: value ?? undefined })" />
            </label>
          </template>
        </template>
        <p v-else class="trackHint">点击轨道上的片段设置时长或入出点</p>
        <label class="fieldRow">
          <span>原声音量</span>
          <el-slider v-model="state.originalVolume" size="small" :min="0" :max="200" :formatTooltip="(value: number) => `${value}%`" :disabled="exporting" aria-label="原声音量" />
        </label>
        <label class="fieldRow">
          <span>配乐音量</span>
          <el-slider v-model="state.musicVolume" size="small" :min="0" :max="200" :formatTooltip="(value: number) => `${value}%`" :disabled="exporting || !music.length" aria-label="配乐音量" />
        </label>
      </el-card>
    </template>
  </nodeSkeleton>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onScopeDispose, reactive, ref, watch } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { ElButton, ElCard, ElInputNumber, ElMessage, ElProgress, ElSlider } from "element-plus";
import { IconCircleCheck, IconFileExport, IconFileText, IconMovie, IconMusic, IconPlayerStop, IconTimeline } from "@tabler/icons-vue";
import { VueDraggable } from "vue-draggable-plus";
import { nodeSkeleton, useNode, useNodeInputs, type NodeHandle, type NodeInputValue, type NodeMediaValue, type WorkspaceFiles } from "@toonflow/nodes-scaffold/runtime";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import clipThumb from "./components/clipThumb.vue";
import { exportTimeline, type TimelineClip } from "./timelineExport";
import { createEdl } from "./timelineEdl";

defineOptions({
  inheritAttrs: false,
  icon: IconTimeline,
  handles: [
    { id: "in", type: "target", dataType: ["VIDEO", "IMAGE"], label: "画面片段" },
    { id: "audio", type: "target", dataType: "AUDIO", label: "配音/BGM" },
    { id: "video", type: "source", dataType: "VIDEO", label: "成片输出" },
  ] satisfies NodeHandle[],
});

type ClipSetting = { key: string; duration?: number; start?: number; end?: number };
type TimelineState = { clips: ClipSetting[]; originalVolume: number; musicVolume: number; lastExport?: { url: string; duration: number } };
type ClipItem = {
  key: string;
  kind: "VIDEO" | "IMAGE";
  file?: NodeMediaValue;
  label: string;
  shotDuration?: number;
  mediaDuration?: number;
  setting: ClipSetting;
};

const imageDuration = 3;
const { id, node, nodeProps, outputs, nodeEvent, files, ffmpeg: loadFfmpeg } = useNode({ label: "成片时间线" });
const { addNodes, findNode, getNodes, nodeTypes } = useVueFlow();
const inputs = useNodeInputs();
const getCanvas = inject<(() => { id: string } | undefined) | undefined>("canvas", undefined);
const batchHistory = inject<(action: () => Promise<void>) => Promise<void>>("batchCanvasHistory", action => action());
const nodeData = node.data as typeof node.data & { timeline?: Partial<TimelineState> };
const saved = nodeData.timeline;
const state = reactive<TimelineState>({
  clips: Array.isArray(saved?.clips) ? saved.clips.filter(item => item && typeof item.key === "string").map(readSetting) : [],
  originalVolume: readVolume(saved?.originalVolume),
  musicVolume: readVolume(saved?.musicVolume),
  lastExport: saved?.lastExport && typeof saved.lastExport.url === "string" && Number.isFinite(saved.lastExport.duration) ? saved.lastExport : undefined,
});
const mediaDurations = reactive(new Map<string, number>());
const selectedKey = ref("");
const exporting = ref(false);
const cancelling = ref(false);
const progress = ref(0);
let controller: AbortController | undefined;
let job: Promise<void> | undefined;

const resultFile = computed(() => outputs.value.video?.dataType === "VIDEO" ? outputs.value.video.value as NodeMediaValue : undefined);
const resultUrl = files.useFileUrl(resultFile, () => {});

function readNumber(value: unknown, min: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min ? value : undefined;
}

function readSetting(item: ClipSetting): ClipSetting {
  return { key: item.key, duration: readNumber(item.duration, 0.1), start: readNumber(item.start, 0), end: readNumber(item.end, 0.1) };
}

function readVolume(value: unknown) {
  return typeof value === "number" && value >= 0 && value <= 200 ? value : 100;
}

function readMedia(item: NodeInputValue) {
  const value = item.value as Partial<NodeMediaValue> | undefined;
  return value && typeof value.url === "string" && typeof value.mimeType === "string" ? { url: value.url, mimeType: value.mimeType } : undefined;
}

function readShotDuration(source: string, sourceHandle: string) {
  // 兼容分镜类节点的 data.shots[].duration；按端口匹配镜头，只有一个镜头时直接使用，其余情况忽略。
  const shots = (findNode(source)?.data as { shots?: unknown } | undefined)?.shots;
  if (!Array.isArray(shots)) return;
  const shot = shots.find(item => item && typeof item === "object" && (item.id === sourceHandle || item.handle === sourceHandle))
    ?? (shots.length === 1 ? shots[0] : undefined);
  const duration = Number((shot as { duration?: unknown } | undefined)?.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

const incoming = computed(() => {
  const counts = new Map<string, number>();
  return inputs.getTargetValues(id, "in").map(item => {
    // 同一端口可能重复连线，按出现次数区分，保证每条连线一个片段。
    const base = `${item.source}|${item.sourceHandle}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    const file = readMedia(item);
    const kind: ClipItem["kind"] = item.dataType === "IMAGE" || file?.mimeType.startsWith("image/") ? "IMAGE" : "VIDEO";
    return { key: `${base}|${count}`, kind, file, label: String(findNode(item.source)?.data?.label || (kind === "IMAGE" ? "图片" : "视频")), shotDuration: readShotDuration(item.source, item.sourceHandle) };
  });
});

const clips = computed<ClipItem[]>({
  get() {
    const order = new Map(state.clips.map((item, index) => [item.key, index]));
    return incoming.value
      .map((item, index) => ({ item, index, order: order.get(item.key) ?? state.clips.length + index }))
      .sort((left, right) => left.order - right.order)
      .map(({ item }) => ({
        ...item,
        mediaDuration: mediaDurations.get(item.key),
        setting: state.clips.find(setting => setting.key === item.key) ?? { key: item.key },
      }));
  },
  set(value) {
    const keys = new Set(value.map(item => item.key));
    // ACT: 断开的连线保留其设置，避免画布加载时边晚于节点出现导致设置丢失；不做清理。
    state.clips = [...value.map(item => state.clips.find(setting => setting.key === item.key) ?? { key: item.key }), ...state.clips.filter(item => !keys.has(item.key))];
  },
});
const selected = computed(() => clips.value.find(item => item.key === selectedKey.value));
const playable = computed(() => clips.value.filter(item => item.file));
const skipped = computed(() => clips.value.length - playable.value.length);
const music = computed(() => inputs.getTargetValues(id, "audio").flatMap(item => {
  const file = readMedia(item);
  return file ? [{ ...item, file, label: String(findNode(item.source)?.data?.label || file.url.split(/[\\/]/).at(-1) || "音频") }] : [];
}));
const totalDuration = computed(() => playable.value.reduce((sum, item) => sum + (clipDuration(item) ?? 0), 0));
const ready = computed(() => playable.value.length > 0 && !!nodeTypes?.value?.["remote-videoNode"]);

function persist() {
  nodeData.timeline = { clips: state.clips.map(item => ({ ...item })), originalVolume: state.originalVolume, musicVolume: state.musicVolume, lastExport: state.lastExport };
}
watch(state, persist, { deep: true, flush: "sync", immediate: true });
watch(clips, value => { if (!value.some(item => item.key === selectedKey.value)) selectedKey.value = value[0]?.key ?? ""; }, { immediate: true });
watch(() => getCanvas?.()?.id, cancel, { flush: "sync" });
onScopeDispose(cancel);

nodeEvent.on("save", async reason => {
  if (reason === "reload" && exporting.value) throw new Error("成片合成中，请完成或取消后再刷新节点");
});
// ACT: 导出成片由新视频节点引用，删除时间线只停止任务，不删除已提交的素材。
nodeEvent.on("delete", async () => { cancel(); await job; });
nodeEvent.on("copy", () => ({ timeline: { clips: state.clips.map(item => ({ ...item })), originalVolume: state.originalVolume, musicVolume: state.musicVolume } }));

function clipEnd(clip: ClipItem) {
  if (clip.setting.end !== undefined) return clip.setting.end;
  const start = clip.setting.start ?? 0;
  if (clip.shotDuration) return clip.mediaDuration ? Math.min(clip.mediaDuration, start + clip.shotDuration) : start + clip.shotDuration;
  return clip.mediaDuration;
}

function clipDuration(clip: ClipItem) {
  if (clip.kind === "IMAGE") return clip.setting.duration ?? clip.shotDuration ?? imageDuration;
  const end = clipEnd(clip);
  return end === undefined ? undefined : Math.max(0, end - (clip.setting.start ?? 0));
}

function clipWidth(clip: ClipItem) {
  // ACT: 卡片宽度按时长线性缩放并限制在 96–200px，不做可缩放的时间刻度尺。
  return Math.round(Math.min(200, Math.max(96, (clipDuration(clip) ?? 5) * 16)));
}

function formatSeconds(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "--";
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return minutes ? `${minutes}:${seconds.toFixed(1).padStart(4, "0")}` : `${seconds.toFixed(1)} 秒`;
}

function setMediaDuration(clip: ClipItem, value: number | undefined) {
  if (clip.kind === "VIDEO" && value) mediaDurations.set(clip.key, value);
}

function updateClip(clip: ClipItem, patch: Partial<ClipSetting>) {
  let setting = state.clips.find(item => item.key === clip.key);
  if (!setting) state.clips.push(setting = { key: clip.key });
  Object.assign(setting, patch);
  if (setting.end !== undefined && setting.end <= (setting.start ?? 0)) setting.end = undefined;
}

function moveClip(from: number, to: number) {
  const next = [...clips.value];
  const [item] = next.splice(from, 1);
  if (!item || to < 0 || to > next.length) return;
  next.splice(to, 0, item);
  clips.value = next;
}

function toTimelineClips() {
  return playable.value.map<TimelineClip>(clip => ({
    kind: clip.kind,
    path: clip.file!.url,
    start: clip.kind === "VIDEO" ? clip.setting.start ?? 0 : 0,
    duration: clipDuration(clip),
  }));
}

function downloadEdl() {
  const list = toTimelineClips();
  const missing = list.findIndex(clip => clip.duration === undefined);
  if (missing >= 0) return void ElMessage.warning(`第 ${missing + 1} 段视频时长尚未读取，请稍后重试`);
  const title = String(node.data.label || "成片时间线");
  const url = URL.createObjectURL(new Blob([createEdl(title, list as (TimelineClip & { duration: number })[])], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[\\/:*?"<>|]/g, "_")}.edl`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function cancel() {
  if (!controller) return;
  cancelling.value = true;
  controller.abort();
}

function run() {
  if (exporting.value || !ready.value) return;
  job = process();
}

async function process() {
  const current = controller = new AbortController();
  const outputId = crypto.randomUUID();
  const directory = `assets/${outputId}`;
  const path = `${directory}/video.mp4`;
  const list = toTimelineClips();
  const musicPaths = music.value.map(item => item.file.url);
  let workspace: WorkspaceFiles | undefined;
  let created = false;
  let committed = false;
  exporting.value = true;
  cancelling.value = false;
  progress.value = 0;
  try {
    workspace = files.getWorkspaceFiles();
    const ffmpeg = await loadFfmpeg(current.signal);
    current.signal.throwIfAborted();
    await workspace.mkdir("assets").catch(error => { if (error?.response?.data?.data?.code !== "EEXIST") throw error; });
    current.signal.throwIfAborted();
    await workspace.mkdir(directory);
    created = true;
    const media = await exportTimeline(ffmpeg, {
      clips: list,
      music: musicPaths,
      outputPath: path,
      originalVolume: state.originalVolume,
      musicVolume: state.musicVolume,
      onProgress: value => { progress.value = value; },
    }, current.signal);
    current.signal.throwIfAborted();
    const file = { url: path, mimeType: "video/mp4" };
    const width = Math.max(180, 240 * media.width / media.height + 18);
    const x = node.computedPosition.x + node.dimensions.width + 80;
    let y = node.computedPosition.y;
    for (const other of [...getNodes.value].sort((left, right) => left.computedPosition.y - right.computedPosition.y)) {
      const position = other.computedPosition;
      if (position.x < x + width && position.x + other.dimensions.width > x && position.y < y + 320 && position.y + other.dimensions.height > y) y = position.y + other.dimensions.height + 40;
    }
    await batchHistory(async () => {
      current.signal.throwIfAborted();
      if (findNode(node.id) !== node || !nodeTypes?.value?.["remote-videoNode"]) throw new Error("画布节点已变化，请重新导出");
      // ACT: 视频节点没有输入端口，无法连线；成片同时写入本节点「成片输出」端口，新节点直接引用同一文件。
      addNodes({ id: outputId, type: "remote-videoNode", position: { x, y }, data: { label: `${node.data.label || "成片时间线"} · 成片`, outputs: { video: { dataType: "VIDEO", value: { ...file } } } } });
      outputs.value.video = { dataType: "VIDEO", value: file };
      state.lastExport = { url: path, duration: media.duration };
      committed = true;
    });
    progress.value = 100;
    await nextTick();
    ElMessage.success(`成片已导出，时长 ${formatSeconds(media.duration)}`);
  } catch (error) {
    if (!current.signal.aborted) showNodeError(error, "成片导出失败");
  } finally {
    if (created && !committed && workspace) {
      await workspace.remove(directory, true).catch(error => {
        if (error?.response?.data?.data?.code !== "ENOENT") ElMessage.error("临时成片文件清理失败，未能全部删除。");
      });
    }
    exporting.value = cancelling.value = false;
    if (controller === current) controller = undefined;
  }
}
</script>

<style scoped lang="scss">
.timelineContent {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 520px;
  padding: 4px 2px;
  color: var(--el-text-color-regular);
  font-size: 12px;

  .emptyState {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 28px 16px;
    color: var(--el-text-color-secondary);
    text-align: center;
    svg { color: var(--el-text-color-placeholder); }
  }

  .trackRow {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 6px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--ui-radius);
    background: var(--el-bg-color-page);

    .trackIcon { flex-shrink: 0; color: var(--el-text-color-secondary); }
  }

  .clipTrack {
    display: flex;
    flex: 1;
    gap: 6px;
    min-width: 0;
    padding-bottom: 2px;
    overflow-x: auto;
  }

  .clipCard {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--el-border-color-light);
    border-radius: var(--ui-radius-small);
    background: var(--el-bg-color);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: grab;
    animation: clipFadeIn 120ms ease-out;
    transition: transform 120ms ease-out, border-color 120ms ease-out;

    &:hover { transform: translateY(-1px); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
    &.active {
      border-color: var(--el-color-primary);
      background: color-mix(in srgb, var(--el-color-primary) 12%, var(--el-bg-color));
    }
    &.missing { opacity: 0.6; }

    .clipMeta {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      line-height: 16px;
    }
    .clipIndex { color: var(--el-color-primary); font-weight: 600; }
    .clipLabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .clipTime { flex-shrink: 0; color: var(--el-text-color-secondary); }
  }

  .clipGhost { opacity: 0.4; }

  .audioTrack {
    display: flex;
    flex: 1;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
  }

  .audioChip {
    flex-shrink: 0;
    max-width: 160px;
    padding: 2px 8px;
    overflow: hidden;
    border-radius: var(--ui-radius-small);
    background: color-mix(in srgb, var(--el-color-primary) 12%, var(--el-bg-color));
    color: var(--el-color-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
    animation: clipFadeIn 120ms ease-out;
  }

  .statusRow, .progressFooter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--el-text-color-secondary);
  }

  .progressArea { display: grid; gap: 6px; }

  .resultRow {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--el-text-color-secondary);
    animation: clipFadeIn 120ms ease-out;
    svg { color: var(--el-color-success); }
  }

  @media (prefers-reduced-motion: reduce) {
    .clipCard, .audioChip, .resultRow { animation: none; transition: none; }
  }
}

.trackHint { color: var(--el-text-color-placeholder); font-size: 12px; }

.editorCard {
  font-size: 12px;

  .editorTitle {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    color: var(--el-text-color-primary);
  }

  .fieldRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 32px;
    color: var(--el-text-color-regular);
    .el-input-number { width: 140px; }
    .el-slider { width: 260px; }
  }
}

@keyframes clipFadeIn {
  from { opacity: 0; }
}
</style>
