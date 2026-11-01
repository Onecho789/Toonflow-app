<template>
  <div class="resultCard" tabindex="0" :aria-label="name">
    <img v-if="url" :src="url" :alt="name" draggable="false" @dblclick="emit('preview', url)" />
    <div v-else class="imageState" role="img" :aria-label="failed ? '图片读取失败' : '图片加载中'">
      <icon-photo-off v-if="failed" :size="28" stroke="1.5" aria-hidden="true" />
    </div>
    <div v-if="url" class="cardActions">
      <el-button :icon="IconZoomIn" circle title="预览大图" aria-label="预览大图" @click="emit('preview', url)" />
      <el-button tag="a" :href="url" :download="name" :icon="IconDownload" circle title="下载" aria-label="下载" />
      <el-button :icon="IconLibraryPhoto" circle :loading="saving" title="加入素材库" aria-label="加入素材库" @click="addToAssets" />
      <el-button :icon="IconPhotoPlus" circle title="用作参考图" aria-label="用作参考图" @click="emit('reference')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElMessage } from "element-plus";
import { IconDownload, IconLibraryPhoto, IconPhotoOff, IconPhotoPlus, IconZoomIn } from "@tabler/icons-vue";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import saveToAssets from "@/lib/saveToAssets";
import { useImageUrl } from "./studioFiles";

const props = defineProps<{ directory: string; path: string }>();
const emit = defineEmits<{ preview: [url: string]; reference: [] }>();
const { url, failed } = useImageUrl(() => props.directory, () => props.path);
const name = computed(() => props.path.split("/").at(-1)!);
const saving = ref(false);

async function addToAssets() {
  saving.value = true;
  try {
    const target = await saveToAssets(props.directory, props.path, "生图");
    ElMessage.success(`已加入素材库：${target}`);
  } catch (error) {
    showNodeError(error, "加入素材库失败");
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.resultCard {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
  border-radius: 8px;
  background: var(--el-fill-color-light);

  > img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .imageState {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--el-text-color-placeholder);
  }

  .cardActions {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: flex;
    gap: 6px;
    opacity: 0;
    transition: opacity 0.15s;

    .el-button { margin: 0; }
  }

  &:hover .cardActions, &:focus-within .cardActions { opacity: 1; }
}
</style>
