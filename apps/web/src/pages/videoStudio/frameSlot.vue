<template>
  <div class="frameSlot">
    <div class="slotLabel">{{ label }}</div>
    <div v-if="previewUrl" class="slotPreview">
      <img :src="previewUrl" :alt="label" />
      <el-button class="removeButton" :icon="IconX" circle size="small" :disabled="disabled" :aria-label="`移除${label}`" @click="emit('remove')" />
    </div>
    <el-button v-else class="slotButton" :icon="IconUpload" :loading="uploading" :disabled="disabled" :aria-label="`上传${label}`" @click="input?.click()" />
    <input ref="input" type="file" accept="image/*" hidden :aria-label="`选择${label}`" @change="selectFile" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconUpload, IconX } from "@tabler/icons-vue";

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

  .slotLabel {
    margin-bottom: 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: 500;
  }

  .slotPreview {
    position: relative;
    height: 96px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--el-fill-color-light);

    img { width: 100%; height: 100%; object-fit: contain; }

    .removeButton { position: absolute; top: 6px; right: 6px; }
  }

  .slotButton {
    width: 100%;
    height: 96px;
    border-style: dashed;
  }
}
</style>
