<template>
  <workbenchShell type="video" title="视频工作台" v-slot="{ directory }">
    <videoWorkbench :directory="directory" />
  </workbenchShell>
</template>

<script setup lang="ts">
import workbenchShell from "@/components/workbenchShell.vue";
import videoWorkbench from "./videoWorkbench.vue";
</script>
