<template>
  <workbenchShell type="image" title="生图工作台">
    <template #default="{ directory }">
      <studioPanel :directory="directory" />
    </template>
  </workbenchShell>
</template>

<script setup lang="ts">
import workbenchShell from "@/components/workbenchShell.vue";
import studioPanel from "./studioPanel.vue";
</script>
