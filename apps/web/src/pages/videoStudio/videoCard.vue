<template>
  <article ref="element" class="videoCard" :aria-label="name">
    <div class="cardMedia">
      <videoPlayer v-if="url" :src="url" :label="name" />
      <div v-else class="cardLoading" v-loading="!failed" :aria-busy="!failed">
        <span v-if="failed">视频读取失败</span>
      </div>
    </div>
    <footer class="cardFooter">
      <span class="cardName" :title="name">{{ name }}</span>
      <el-tooltip v-if="url" content="下载" placement="top">
        <a class="actionLink" :href="url" :download="name" aria-label="下载"><icon-download :size="16" /></a>
      </el-tooltip>
      <el-button size="small" type="primary" plain round :icon="IconLibraryPlus" :loading="saving" @click="addToAssets">加入素材库</el-button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElMessage, vLoading } from "element-plus";
import { IconDownload, IconLibraryPlus } from "@tabler/icons-vue";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import videoPlayer from "@/components/videoPlayer.vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import saveToAssets from "@/lib/saveToAssets";

const props = defineProps<{ directory: string; path: string; name: string }>();
const element = ref<HTMLElement>();
const visible = ref(false);
const url = ref("");
const failed = ref(false);
const saving = ref(false);
let observer: IntersectionObserver | undefined;

// ACT: 视频按 Blob 读取，进入视口才加载，避免结果多时一次读入全部文件。
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return;
    visible.value = true;
    observer?.disconnect();
  }, { rootMargin: "200px" });
  if (element.value) observer.observe(element.value);
});
onBeforeUnmount(() => observer?.disconnect());

watch([visible, () => props.directory, () => props.path], async ([visible, directory, path], _previous, onCleanup) => {
  url.value = "";
  failed.value = false;
  if (!visible) return;
  let cancelled = false;
  const preview = useWorkspaceFiles(directory).acquireUrl(path);
  onCleanup(() => { cancelled = true; preview.release(); });
  try {
    const value = await preview.url;
    if (!cancelled) url.value = value;
  } catch {
    if (!cancelled) failed.value = true;
  }
});

async function addToAssets() {
  saving.value = true;
  try {
    const target = await saveToAssets(props.directory, props.path, "视频");
    ElMessage.success(`已加入素材库：${target}`);
  } catch (error) {
    showNodeError(error, "加入素材库失败");
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.videoCard {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: calc(var(--ui-radius) * 1.5);
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-lighter);
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;

  .cardMedia {
    background: #000;

    .cardLoading {
      display: flex;
      align-items: center;
      justify-content: center;
      aspect-ratio: 16 / 9;
      background: var(--el-fill-color-light);
      color: var(--el-text-color-secondary);
      font-size: 13px;
    }
  }

  .cardFooter {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 12px;

    .cardName {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      color: var(--el-text-color-secondary);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .actionLink {
      display: inline-grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      color: var(--el-text-color-regular);
      transition: background 0.15s, color 0.15s;

      &:hover { background: var(--el-fill-color); color: var(--el-color-primary); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); }
    }
  }

  &:hover {
    border-color: var(--el-color-primary-light-7);
    box-shadow: var(--el-box-shadow-light);
    transform: translateY(-2px);
  }

  @media (prefers-reduced-motion: reduce) { transition: none; &:hover { transform: none; } }
}
</style>
