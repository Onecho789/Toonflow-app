<template>
  <div class="frameSlot">
    <div v-if="previewUrl" class="slotPreview">
      <img :src="previewUrl" :alt="label" />
      <span class="slotTag">{{ label }}</span>
      <button type="button" class="removeButton" :disabled="disabled" :aria-label="`移除${label}`" @click="emit('remove')"><icon-x :size="12" /></button>
    </div>
    <button v-else type="button" class="slotButton" :disabled="disabled" :aria-label="`上传${label}`" :aria-busy="uploading" @click="input?.click()">
      <icon-loader-2 v-if="uploading" class="spinIcon" :size="20" aria-hidden="true" />
      <icon-photo-plus v-else :size="20" aria-hidden="true" />
      <span>{{ uploading ? "上传中" : `上传${label}` }}</span>
    </button>
    <input ref="input" type="file" accept="image/*" hidden :aria-label="`选择${label}`" @change="selectFile" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconLoader2, IconPhotoPlus, IconX } from "@tabler/icons-vue";

defineProps<{ label: string; previewUrl?: string; uploading?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ select: [file: File]; remove: [] }>();
const input = ref<HTMLInputElement>();

function selectFile(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (file) emit("select", file);
}
</script>

<style lang="scss" scoped>
.frameSlot {
  flex: 1;
  min-width: 0;

  .slotPreview,
  .slotButton {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border-radius: var(--ui-radius);
    box-sizing: border-box;
  }

  .slotPreview {
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-fill-color-light);

    img { width: 100%; height: 100%; object-fit: contain; }

    .slotTag {
      position: absolute;
      top: 6px;
      left: 6px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgb(0 0 0 / 60%);
      color: #fff;
      font-size: 11px;
      line-height: 1.6;
    }

    .removeButton {
      position: absolute;
      top: 6px;
      right: 6px;
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgb(0 0 0 / 60%);
      color: #fff;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;

      &:focus-visible { opacity: 1; outline: 2px solid var(--el-color-primary); }
      &:disabled { cursor: not-allowed; }
    }

    &:hover .removeButton { opacity: 1; }
  }

  .slotButton {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0;
    border: 1px dashed var(--el-border-color);
    background: var(--el-fill-color-lighter);
    color: var(--el-text-color-secondary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;

    &:hover:not(:disabled) { border-color: var(--el-color-primary); color: var(--el-color-primary); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    &:disabled { cursor: not-allowed; opacity: 0.6; }

    .spinIcon { animation: spin 1s linear infinite; }
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
