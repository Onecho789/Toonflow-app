<template>
  <div class="clipThumb">
    <img v-if="url && kind === 'IMAGE'" :src="url" alt="" draggable="false" @load="emit('duration', undefined)" />
    <video v-else-if="url" :src="`${url}#t=0.1`" preload="metadata" muted playsinline disablepictureinpicture tabindex="-1" @loadedmetadata="readDuration" />
    <span v-else class="placeholder" aria-hidden="true">
      <icon-alert-triangle v-if="failed" :size="18" />
      <icon-loader2 v-else class="loadingIcon" :size="18" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-vue";
import { useNodeFiles, type NodeMediaValue } from "@toonflow/nodes-scaffold/runtime";

const props = defineProps<{ file?: NodeMediaValue; kind: "VIDEO" | "IMAGE" }>();
const emit = defineEmits<{ duration: [value: number | undefined] }>();
const failed = ref(false);
const url = useNodeFiles().useFileUrl(() => props.file, () => { failed.value = true; });

function readDuration(event: Event) {
  const duration = (event.currentTarget as HTMLVideoElement).duration;
  emit("duration", Number.isFinite(duration) && duration > 0 ? duration : undefined);
}
</script>

<style scoped lang="scss">
.clipThumb {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--ui-radius-small);
  background: var(--el-bg-color-page);
  img, video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .placeholder { color: var(--el-text-color-placeholder); }
  .loadingIcon {
    color: var(--el-color-primary);
    animation: nodeLoading 1s linear infinite;
    @media (prefers-reduced-motion: reduce) { animation: none; }
  }
}

// 与 nodeSkeleton 的加载动画一致；scoped 关键帧不跨组件共享，这里同名复刻。
@keyframes nodeLoading {
  to { transform: rotate(360deg); }
}
</style>
