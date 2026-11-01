<template>
  <div class="referenceList" :class="{ dropping }" @dragover="dragOver" @dragleave.self="dropping = false" @drop="drop">
    <div class="referenceGrid">
      <div
        v-for="(item, index) in modelValue"
        :key="item.path"
        class="referenceItem"
        tabindex="0"
        :draggable="!disabled"
        :aria-label="`${label(index)}，Alt 加左右方向键调整顺序`"
        @dragstart="dragIndex = index"
        @dragend="dragIndex = undefined"
        @drop.stop="dropOn(index)"
        @dragover.prevent
        @keydown.alt.left.prevent="move(index, index - 1)"
        @keydown.alt.right.prevent="move(index, index + 1)">
        <studioImage v-if="kindOf(item) === 'image'" :directory="directory" :path="item.path" :alt="label(index)" />
        <span v-else class="mediaIcon"><component :is="kindOf(item) === 'video' ? IconMovie : IconMusic" :size="22" aria-hidden="true" /></span>
        <span class="referenceIndex">{{ label(index) }}</span>
        <button type="button" class="removeButton" :disabled="disabled" :aria-label="`移除${label(index)}`" @click="remove(index)"><icon-x :size="12" /></button>
      </div>
      <el-dropdown trigger="click" :disabled="disabled || uploading" @command="command">
        <button type="button" class="referenceAdd" :disabled="disabled || uploading" aria-label="添加参考素材">
          <el-icon v-if="uploading" class="is-loading" :size="18"><icon-loader-2 /></el-icon>
          <icon-plus v-else :size="20" aria-hidden="true" />
          <span>添加</span>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="upload" :icon="IconUpload">本地上传</el-dropdown-item>
            <el-dropdown-item command="results" :icon="IconPhoto">本文件夹作品</el-dropdown-item>
            <el-dropdown-item command="assets" :icon="IconLibraryPhoto">素材库</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <div class="referenceFooter">
      <p class="referenceTip">支持拖入文件、Ctrl+V 粘贴，拖动缩略图调整顺序</p>
      <el-button size="small" :icon="IconClipboard" :disabled="disabled || uploading" @click="pasteClipboard">剪贴板</el-button>
      <el-button size="small" :icon="IconUpload" :disabled="disabled || uploading" @click="fileInput?.click()">上传</el-button>
    </div>
    <input ref="fileInput" type="file" :accept="kinds.map(kind => `${kind}/*`).join(',')" multiple hidden aria-label="选择参考素材" @change="selectFiles" />
    <mediaPickerDialog v-model="pickerVisible" :source="pickerSource" :directory="directory" :kinds="kinds" @pick="add" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import axios from "axios";
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElMessage } from "element-plus";
import { IconClipboard, IconLibraryPhoto, IconLoader2, IconMovie, IconMusic, IconPhoto, IconPlus, IconUpload, IconX } from "@tabler/icons-vue";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { readClipboardFiles } from "@/lib/clipboard";
import studioImage from "@/pages/imageStudio/studioImage.vue";
import { mediaExtension, mediaKind, timestampName, type MediaKind } from "@/pages/imageStudio/studioFiles";
import mediaPickerDialog from "./mediaPickerDialog.vue";

export type ReferenceFile = { path: string; mimeType: string };

// limits 为各类型的数量上限，缺省时不限制；序号按类型分别编号：图1、视频1、音频1。
const props = defineProps<{ modelValue: ReferenceFile[]; directory: string; kinds: MediaKind[]; limits?: Partial<Record<MediaKind, number>>; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [items: ReferenceFile[]] }>();
const referenceDirectory = "references";
const kindNames: Record<MediaKind, string> = { image: "图", video: "视频", audio: "音频" };
const uploading = ref(false);
const dropping = ref(false);
const dragIndex = ref<number>();
const fileInput = ref<HTMLInputElement>();
const pickerVisible = ref(false);
const pickerSource = ref<"results" | "assets">("results");

const kindOf = (item: ReferenceFile) => mediaKind(item.mimeType) ?? "image";

function label(index: number) {
  const kind = kindOf(props.modelValue[index]!);
  return `${kindNames[kind]}${props.modelValue.slice(0, index + 1).filter(item => kindOf(item) === kind).length}`;
}

function command(value: string) {
  if (value === "upload") return fileInput.value?.click();
  pickerSource.value = value as "results" | "assets";
  pickerVisible.value = true;
}

// 按上限截断，超出的提示一次；同一路径不重复添加。
function add(items: ReferenceFile[]) {
  const next = [...props.modelValue];
  let skipped = 0;
  for (const item of items) {
    const kind = mediaKind(item.mimeType);
    if (!kind || !props.kinds.includes(kind) || next.some(current => current.path === item.path)) continue;
    const limit = props.limits?.[kind];
    if (limit !== undefined && next.filter(current => kindOf(current) === kind).length >= limit) { skipped++; continue; }
    next.push(item);
  }
  if (skipped) ElMessage.warning(`已达到数量上限，${skipped} 个素材未添加`);
  emit("update:modelValue", next);
}

function remove(index: number) {
  emit("update:modelValue", props.modelValue.filter((_item, current) => current !== index));
}

function move(from: number, to: number) {
  if (props.disabled || to < 0 || to >= props.modelValue.length || from === to) return;
  const next = [...props.modelValue];
  next.splice(to, 0, ...next.splice(from, 1));
  emit("update:modelValue", next);
}

function dropOn(index: number) {
  if (dragIndex.value === undefined) return;
  move(dragIndex.value, index);
  dragIndex.value = undefined;
}

async function upload(files: File[]) {
  const accepted = files.filter(file => { const kind = mediaKind(file.type); return kind && props.kinds.includes(kind) && mediaExtension(file.type); });
  if (accepted.length < files.length) ElMessage.warning("部分文件格式不支持，已跳过");
  if (!accepted.length) return;
  const directory = props.directory;
  const workspace = useWorkspaceFiles(directory);
  uploading.value = true;
  try {
    await workspace.mkdir(referenceDirectory).catch(error => { if (!axios.isAxiosError(error) || error.response?.status !== 409) throw error; });
    const result: ReferenceFile[] = [];
    for (const file of accepted) {
      if (!file.size || file.size > 100 * 1024 * 1024) throw new Error(`文件不能为空且不能超过 100 MB：${file.name}`);
      const path = `${referenceDirectory}/${timestampName()}.${mediaExtension(file.type)}`;
      await workspace.write(path, file, true);
      result.push({ path, mimeType: file.type });
    }
    if (directory === props.directory) add(result);
  } catch (error) {
    showNodeError(error, "参考素材上传失败");
  } finally {
    uploading.value = false;
  }
}

function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...input.files ?? []];
  input.value = "";
  void upload(files);
}

function dragOver(event: DragEvent) {
  if (props.disabled || !event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  dropping.value = true;
}

function drop(event: DragEvent) {
  dropping.value = false;
  if (props.disabled || !event.dataTransfer?.files.length) return;
  event.preventDefault();
  void upload([...event.dataTransfer.files]);
}

// 页面内粘贴文件即添加参考素材；粘贴纯文本不受影响。
function paste(event: ClipboardEvent) {
  const files = [...event.clipboardData?.files ?? []];
  if (props.disabled || uploading.value || !files.length) return;
  event.preventDefault();
  void upload(files);
}
onMounted(() => window.addEventListener("paste", paste));

// 点按钮读取剪贴板里的图片或文件（桌面端经本地服务读取系统剪贴板）。
async function pasteClipboard() {
  try {
    const files = await readClipboardFiles();
    if (!files.length) return void ElMessage.info("剪贴板里没有图片或媒体文件");
    await upload(files);
  } catch (error) {
    showNodeError(error, "读取剪贴板失败");
  }
}
onBeforeUnmount(() => window.removeEventListener("paste", paste));
</script>

<style lang="scss" scoped>
.referenceList {
  border-radius: var(--ui-radius);

  &.dropping { outline: 2px dashed var(--el-color-primary); outline-offset: 4px; }

  .referenceGrid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;

    :deep(.el-dropdown) { display: block; }

    .referenceItem,
    .referenceAdd {
      position: relative;
      width: 100%;
      overflow: hidden;
      aspect-ratio: 1;
      border-radius: var(--ui-radius);
      box-sizing: border-box;
    }

    .referenceItem {
      border: 1px solid var(--el-border-color-lighter);
      background: var(--el-fill-color-light);
      cursor: grab;

      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }

      .mediaIcon { display: grid; place-items: center; height: 100%; color: var(--el-text-color-secondary); }

      .referenceIndex {
        position: absolute;
        bottom: 4px;
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

      &:hover .removeButton, &:focus-within .removeButton { opacity: 1; }
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

  .referenceFooter {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;

    .referenceTip { flex: 1; min-width: 0; margin: 0; color: var(--el-text-color-placeholder); font-size: 11px; }

    .el-button + .el-button { margin-left: 0; }
  }
}
</style>
