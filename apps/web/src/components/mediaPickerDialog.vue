<template>
  <el-dialog :modelValue="modelValue" :title="source === 'assets' ? '从素材库选择' : '从本文件夹作品选择'" width="min(720px, calc(100vw - 32px))" alignCenter appendToBody @update:modelValue="emit('update:modelValue', $event)" @open="load">
    <div v-loading="loading" class="pickerBody" :aria-busy="loading">
      <p v-if="!loading && !entries.length" class="pickerEmpty">{{ source === "assets" ? "素材库里没有可用的素材" : "这个文件夹还没有可用的作品" }}</p>
      <div v-else class="pickerGrid">
        <button
          v-for="item in entries"
          :key="item.path"
          type="button"
          class="pickerItem"
          :class="{ selected: selected.has(item.path) }"
          :aria-pressed="selected.has(item.path)"
          :title="item.path"
          @click="toggle(item.path)">
          <template v-if="item.kind === 'image'">
            <img v-if="source === 'assets'" :src="assetUrl(item.path)" :alt="item.name" loading="lazy" draggable="false" />
            <studioImage v-else :directory="directory" :path="item.path" :alt="item.name" />
          </template>
          <span v-else class="mediaIcon"><component :is="item.kind === 'video' ? IconMovie : IconMusic" :size="26" aria-hidden="true" /></span>
          <span class="itemName">{{ item.name }}</span>
          <span v-if="selected.has(item.path)" class="checkMark" aria-hidden="true"><icon-check :size="14" /></span>
        </button>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!selected.size" :loading="saving" @click="confirm">添加{{ selected.size ? ` ${selected.size} 个` : "" }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import axios from "axios";
import { ElButton, ElDialog, vLoading } from "element-plus";
import { IconCheck, IconMovie, IconMusic } from "@tabler/icons-vue";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { outputDirectory } from "@/stores/workbenchHistory";
import studioImage from "@/pages/imageStudio/studioImage.vue";
import { mediaExtension, mediaKind, mediaMimeType, timestampName, type MediaKind } from "@/pages/imageStudio/studioFiles";

type AssetEntry = { name: string; path: string; type: "file" | "directory"; children?: AssetEntry[] };
type PickerEntry = { name: string; path: string; mimeType: string; kind: MediaKind };

const props = defineProps<{ modelValue: boolean; source: "results" | "assets"; directory: string; kinds: MediaKind[] }>();
const emit = defineEmits<{ "update:modelValue": [visible: boolean]; pick: [items: { path: string; mimeType: string }[]] }>();
const referenceDirectory = "references";
const entries = ref<PickerEntry[]>([]);
const selected = ref(new Set<string>());
const loading = ref(false);
const saving = ref(false);

const assetUrl = (path: string) => `/api/assets/read?path=${encodeURIComponent(path)}`;

function toEntry(name: string, path: string): PickerEntry[] {
  const mimeType = mediaMimeType(name);
  const kind = mimeType && mediaKind(mimeType);
  return kind && props.kinds.includes(kind) ? [{ name, path, mimeType, kind }] : [];
}

async function load() {
  selected.value = new Set();
  entries.value = [];
  loading.value = true;
  try {
    if (props.source === "assets") {
      const { data } = await axios.get<{ data: { entries: AssetEntry[] } }>("/api/assets/list");
      const flatten = (items: AssetEntry[]): PickerEntry[] => items.flatMap(item => item.type === "directory" ? flatten(item.children ?? []) : toEntry(item.name, item.path));
      entries.value = flatten(data.data.entries);
    } else {
      const { entries: files } = await useWorkspaceFiles(props.directory).list(outputDirectory).catch(error => {
        if (axios.isAxiosError(error) && error.response?.status === 404) return { entries: [] };
        throw error;
      });
      entries.value = files.filter(item => item.type === "file").sort((left, right) => (right.mtimeMs ?? 0) - (left.mtimeMs ?? 0))
        .flatMap(item => toEntry(item.name, item.path));
    }
  } catch (error) {
    showNodeError(error, "列表读取失败");
  } finally {
    loading.value = false;
  }
}

function toggle(path: string) {
  const next = new Set(selected.value);
  if (!next.delete(path)) next.add(path);
  selected.value = next;
}

async function confirm() {
  const picked = entries.value.filter(item => selected.value.has(item.path));
  if (props.source === "results") {
    emit("pick", picked.map(item => ({ path: item.path, mimeType: item.mimeType })));
    emit("update:modelValue", false);
    return;
  }
  // 素材库在工作台文件夹之外，先复制到本文件夹的 references/，生成请求只读取工作台内的文件。
  const directory = props.directory;
  const files = useWorkspaceFiles(directory);
  saving.value = true;
  try {
    await files.mkdir(referenceDirectory).catch(error => { if (!axios.isAxiosError(error) || error.response?.status !== 409) throw error; });
    const result = [];
    for (const item of picked) {
      const { data } = await axios.get<Blob>("/api/assets/read", { params: { path: item.path }, responseType: "blob" });
      const path = `${referenceDirectory}/${timestampName()}.${mediaExtension(item.mimeType)}`;
      await files.write(path, data, true);
      result.push({ path, mimeType: item.mimeType });
    }
    emit("pick", result);
    emit("update:modelValue", false);
  } catch (error) {
    showNodeError(error, "素材添加失败");
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

      img, .studioImage, .mediaIcon {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
      }

      .mediaIcon { display: grid; place-items: center; color: var(--el-text-color-secondary); }

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
