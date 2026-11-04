<template>
  <span ref="element" class="mentionThumbnail" :class="{ contain: fit === 'contain' }" :style="size ? { width: `${size}px`, height: `${size}px` } : undefined" aria-hidden="true">
    <video v-if="previewUrl && !failed && thumbnail?.mimeType.startsWith('video/')" :src="previewUrl" preload="metadata" muted playsinline @error="failed = true" @loadedmetadata="reportSize($event.target as HTMLVideoElement)" />
    <img v-else-if="previewUrl && !failed" :src="previewUrl" alt="" draggable="false" @error="failed = true" @load="reportSize($event.target as HTMLImageElement)" />
    <slot v-else />
  </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";

const props = defineProps<{ thumbnail?: { url: string; mimeType: string }; directory?: string; globalAsset?: boolean; size?: number; fit?: "cover" | "contain" }>();
const emit = defineEmits<{ dimensions: [size: { width: number; height: number } | undefined] }>();
const element = ref<HTMLElement>();
const inView = ref(false);
const previewUrl = ref("");
const failed = ref(false);
let observer: IntersectionObserver | undefined;

function reportSize(media: HTMLImageElement | HTMLVideoElement) {
  const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  emit("dimensions", width && height ? { width, height } : undefined);
}

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => { inView.value = !!entry?.isIntersecting; });
  if (element.value) observer.observe(element.value);
});
onBeforeUnmount(() => observer?.disconnect());

watch([inView, () => props.thumbnail?.url, () => props.thumbnail?.mimeType, () => props.directory, () => props.globalAsset], async ([visible, path, mimeType, directory, globalAsset], _old, onCleanup) => {
  previewUrl.value = "";
  failed.value = false;
  emit("dimensions", undefined);
  if (!visible || !path) return;
  if (globalAsset) {
    previewUrl.value = `/api/assets/read?path=${encodeURIComponent(path)}`;
    return;
  }
  if (!directory) return;
  let cancelled = false;
  // ACT: 仅加载可见项并复用文件缓存；视频仍读取完整 Blob，大文件可改为服务端缩略图。
  const preview = useWorkspaceFiles(directory).acquireUrl(path, mimeType);
  onCleanup(() => { cancelled = true; preview.release(); });
  try {
    const url = await preview.url;
    if (!cancelled) previewUrl.value = url;
  } catch {
    if (!cancelled) failed.value = true;
  }
});
</script>

<style scoped lang="scss">
.mentionThumbnail {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border-radius: 5px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);

  img, video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  &.contain {
    img, video { object-fit: contain; }
  }
}
</style>
