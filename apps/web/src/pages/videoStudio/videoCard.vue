<template>
  <article ref="element" class="videoCard" :aria-label="name">
    <videoPlayer v-if="url" :src="url" :label="name" />
    <div v-else class="cardLoading" v-loading="!failed" :aria-busy="!failed">
      <span v-if="failed">视频读取失败</span>
    </div>
    <div class="cardActions">
      <a v-if="url" class="actionLink" :href="url" :download="name" title="下载" aria-label="下载"><icon-download :size="16" /></a>
      <el-button size="small" :icon="IconLibraryPlus" :loading="saving" @click="addToAssets">加入素材库</el-button>
    </div>
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
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-fill-color-light);

  .cardLoading {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 16 / 9;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  .cardActions {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    opacity: 0;
    transition: opacity 0.15s;

    .actionLink {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      color: var(--el-text-color-regular);
      background: var(--el-bg-color);
    }
  }

  &:hover .cardActions,
  &:focus-within .cardActions { opacity: 1; }
}
</style>
