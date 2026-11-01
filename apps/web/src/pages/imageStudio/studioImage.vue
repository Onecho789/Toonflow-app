<template>
  <img v-if="url" class="studioImage" :src="url" :alt="alt" draggable="false" />
  <div v-else class="studioImage imageState" role="img" :aria-label="failed ? '图片读取失败' : '图片加载中'">
    <icon-photo-off v-if="failed" :size="24" stroke="1.5" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { IconPhotoOff } from "@tabler/icons-vue";
import { useImageUrl } from "./studioFiles";

const props = defineProps<{ directory: string; path: string; alt: string }>();
const { url, failed } = useImageUrl(() => props.directory, () => props.path);
</script>

<style lang="scss" scoped>
.studioImage {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;

  &.imageState {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-placeholder);
    background: var(--el-fill-color-light);
  }
}
</style>
