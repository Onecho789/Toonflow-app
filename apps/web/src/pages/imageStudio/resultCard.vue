<template>
  <div class="resultCard" tabindex="0" :aria-label="name">
    <img v-if="url" :src="url" :alt="name" draggable="false" @dblclick="emit('preview', url)" />
    <div v-else class="imageState" role="img" :aria-label="failed ? '图片读取失败' : '图片加载中'">
      <icon-photo-off v-if="failed" :size="28" stroke="1.5" aria-hidden="true" />
      <el-icon v-else class="is-loading" :size="22"><icon-loader-2 /></el-icon>
    </div>
    <div v-if="url" class="cardOverlay">
      <button type="button" class="zoomButton" title="预览大图" aria-label="预览大图" @click="emit('preview', url)"><icon-zoom-in :size="18" /></button>
      <div class="cardActions">
        <el-button class="assetButton" size="small" round :icon="IconLibraryPlus" :loading="saving" @click="addToAssets">加入素材库</el-button>
        <el-tooltip content="用作参考图" placement="top" :showArrow="false">
          <el-button size="small" circle :icon="IconPhotoPlus" aria-label="用作参考图" @click="emit('reference')" />
        </el-tooltip>
        <el-tooltip content="下载" placement="top" :showArrow="false">
          <el-button tag="a" size="small" circle :href="url" :download="name" :icon="IconDownload" aria-label="下载" />
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElIcon, ElMessage, ElTooltip } from "element-plus";
import { IconDownload, IconLibraryPlus, IconLoader2, IconPhotoOff, IconPhotoPlus, IconZoomIn } from "@tabler/icons-vue";
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
  border: 1px solid var(--el-border-color-lighter);
  border-radius: calc(var(--ui-radius) * 1.5);
  background:
    repeating-conic-gradient(var(--el-fill-color-light) 0 25%, var(--el-fill-color-lighter) 0 50%) 0 0 / 16px 16px;
  box-shadow: var(--el-box-shadow-lighter);
  transition: box-shadow 0.2s, transform 0.2s;

  > img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.35s ease;
  }

  .imageState {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--el-text-color-placeholder);
  }

  .cardOverlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 10px;
    background: linear-gradient(to top, rgb(0 0 0 / 62%), transparent 45%);
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;

    .zoomButton {
      display: grid;
      place-items: center;
      align-self: flex-end;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgb(255 255 255 / 88%);
      color: #222;
      cursor: zoom-in;
      pointer-events: auto;

      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    }

    .cardActions {
      display: flex;
      align-items: center;
      gap: 6px;
      pointer-events: auto;

      .el-button { margin: 0; }
      .assetButton { flex: 1; min-width: 0; }
    }
  }

  &:hover,
  &:focus-within {
    box-shadow: var(--el-box-shadow-light);
    transform: translateY(-2px);

    > img { transform: scale(1.03); }
    .cardOverlay { opacity: 1; }
  }

  &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    > img { transition: none; }
    &:hover, &:focus-within { transform: none; > img { transform: none; } }
  }
}
</style>
