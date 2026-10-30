<template>
  <modelIcon v-if="iconOnly" :model="model.modelId" :vendor="model.vendor" :size="size" />
  <span v-else class="modelOption">
    <modelIcon :model="model.modelId" :vendor="model.vendor" :size="size" />
    <span class="modelLabel">{{ model.label }}</span>
  </span>
</template>

<script setup lang="ts">
import { modelIcon } from "@toonflow/model-icons";

withDefaults(defineProps<{ model: { modelId: string; label: string; vendor?: string }; iconOnly?: boolean; size?: number }>(), { iconOnly: false, size: 16 });
</script>

<style scoped>
.modelOption {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  .modelLabel {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
