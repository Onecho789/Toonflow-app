<template>
  <el-dialog :modelValue="!!directory" title="从项目图片选择封面" width="min(720px, calc(100vw - 32px))" alignCenter appendToBody @update:modelValue="!$event && emit('close')" @open="load">
    <div v-loading="loading" class="pickerBody" :aria-busy="loading">
      <p v-if="!loading && !images.length" class="pickerEmpty">这个项目里还没有图片</p>
      <div v-else class="pickerGrid" role="listbox" aria-label="项目图片">
        <button
          v-for="image in images"
          :key="image.path"
          type="button"
          class="pickerItem"
          :class="{ selected: selected === image.path }"
          role="option"
          :aria-selected="selected === image.path"
          :title="image.path"
          @click="selected = image.path"
          @dblclick="selected = image.path; confirm()">
          <studioImage v-if="directory" :directory="directory" :path="image.path" :alt="image.name" />
          <span class="itemName">{{ image.name }}</span>
          <span v-if="selected === image.path" class="checkMark" aria-hidden="true"><icon-check :size="14" /></span>
        </button>
      </div>
      <p v-if="truncated" class="pickerTip">仅显示最近的 {{ maxImages }} 张图片</p>
    </div>
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :disabled="!selected" :loading="saving" @click="confirm">设为封面</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { IconCheck } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import studioImage from "@/pages/imageStudio/studioImage.vue";
import { projectCoverPath, setProjectCover } from "@/pages/home/projectCoverFile";

type ImageEntry = { name: string; path: string; mtimeMs: number };

const props = defineProps<{ directory?: string }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const maxImages = 300;
const maxDirectories = 400;
const images = ref<ImageEntry[]>([]);
const selected = ref("");
const loading = ref(false);
const saving = ref(false);
const truncated = ref(false);
let loadId = 0;

// 广度遍历项目文件夹收集图片，跳过点目录；目录或图片过多时截断，按修改时间新的在前。
async function load() {
  const directory = props.directory;
  if (!directory) return;
  const id = ++loadId;
  images.value = [];
  selected.value = "";
  truncated.value = false;
  loading.value = true;
  const files = useWorkspaceFiles(directory);
  const found: ImageEntry[] = [];
  const directories = [""];
  try {
    for (let index = 0; index < directories.length && index < maxDirectories; index++) {
      const { entries } = await files.list(directories[index]!).catch(() => ({ entries: [] }));
      if (id !== loadId) return;
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        if (entry.type === "directory") directories.push(entry.path);
        else if (entry.path !== projectCoverPath && /\.(avif|apng|bmp|gif|jpe?g|png|webp)$/i.test(entry.name)) found.push({ name: entry.name, path: entry.path, mtimeMs: entry.mtimeMs ?? 0 });
      }
    }
    found.sort((left, right) => right.mtimeMs - left.mtimeMs);
    truncated.value = found.length > maxImages || directories.length > maxDirectories;
    images.value = found.slice(0, maxImages);
  } finally {
    if (id === loadId) loading.value = false;
  }
}

async function confirm() {
  const directory = props.directory;
  if (!directory || !selected.value || saving.value) return;
  saving.value = true;
  try {
    await setProjectCover(directory, new Blob([await useWorkspaceFiles(directory).read(selected.value)]));
    emit("saved");
    emit("close");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "封面设置失败，请重试");
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.pickerBody {
  min-height: 220px;

  .pickerEmpty {
    margin: 0;
    padding: 80px 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    text-align: center;
  }

  .pickerTip {
    margin: 10px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .pickerGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 10px;
    max-height: min(480px, 60vh);
    overflow-y: auto;

    .pickerItem {
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 0;
      border: 2px solid transparent;
      border-radius: var(--ui-radius);
      background: var(--el-fill-color-light);
      color: var(--el-text-color-regular);
      font: inherit;
      cursor: pointer;

      .studioImage { width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; }

      .itemName {
        overflow: hidden;
        padding: 4px 6px;
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .checkMark {
        position: absolute;
        top: 6px;
        right: 6px;
        display: grid;
        place-items: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--el-color-primary);
        color: #fff;
      }

      &.selected { border-color: var(--el-color-primary); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    }
  }
}
</style>
