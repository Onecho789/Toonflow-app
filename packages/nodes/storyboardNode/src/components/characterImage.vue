<template>
  <img v-if="url" class="characterImage" :src="url" :alt="alt" draggable="false" />
  <span v-else class="characterImage placeholder" role="img" :aria-label="failed ? `${alt}读取失败` : alt">
    <icon-photo-off v-if="failed" :size="16" aria-hidden="true" />
    <icon-photo v-else :size="16" aria-hidden="true" />
  </span>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconPhoto, IconPhotoOff } from "@tabler/icons-vue";
import { useNodeFiles } from "@toonflow/nodes-scaffold/runtime";
import { imageMimeType } from "../characterLibrary";

const props = defineProps<{ path: string; alt: string }>();
const failed = ref(false);
const url = useNodeFiles().useFileUrl(() => {
  failed.value = false;
  return { url: props.path, mimeType: imageMimeType(props.path) };
}, () => { failed.value = true; });
</script>

<style scoped lang="scss">
.characterImage {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--ui-radius-small);
  object-fit: cover;

  &.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-placeholder);
  }
}
</style>
