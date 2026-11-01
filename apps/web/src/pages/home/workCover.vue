<template>
  <span ref="element" class="workCover" aria-hidden="true">
    <template v-if="url && !failed">
      <img v-if="type === 'image'" :src="url" alt="" draggable="false" decoding="async" @error="failed = true" />
      <video v-else :src="url" muted preload="metadata" @error="failed = true" />
    </template>
    <component :is="type === 'image' ? IconPhoto : IconMovie" v-else :size="36" />
    <span v-if="type === 'video'" class="videoBadge"><icon-player-play-filled :size="12" /></span>
  </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { IconMovie, IconPhoto, IconPlayerPlayFilled } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { imageMimeType } from "../imageStudio/studioFiles";

const props = defineProps<{ directory: string; path: string; type: "image" | "video" }>();
const element = ref<HTMLElement>();
const visible = ref(false);
const url = ref("");
const failed = ref(false);
let observer: IntersectionObserver | undefined;

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return;
    visible.value = true;
    observer?.disconnect();
  }, { rootMargin: "200px" });
  if (element.value) observer.observe(element.value);
});
onBeforeUnmount(() => observer?.disconnect());

// ACT: 进入视口才读取；视频与工作台一样整段读成 Blob 再取首帧，文件很大时可改用服务端缩略图。
watch([visible, () => props.directory, () => props.path], ([visible, directory, path], _previous, onCleanup) => {
  url.value = "";
  failed.value = false;
  if (!visible) return;
  let active = true;
  const preview = useWorkspaceFiles(directory).acquireUrl(path, props.type === "image" ? imageMimeType(path) : undefined);
  onCleanup(() => { active = false; preview.release(); });
  preview.url.then(value => { if (active) url.value = value; }, () => { if (active) failed.value = true; });
});
</script>

<style lang="scss" scoped>
.workCover {
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  color: var(--el-text-color-secondary);

  img,
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .videoBadge {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgb(0 0 0 / 55%);
    color: #fff;
  }
}
</style>
