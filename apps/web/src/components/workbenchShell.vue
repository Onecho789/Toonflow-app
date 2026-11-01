<template>
  <section class="workbenchShell" :aria-label="title">
    <header class="shellHeader">
      <h1>{{ title }}</h1>
      <el-button class="directoryButton" text :icon="IconFolder" :loading="picker?.selecting" :title="directory || '选择文件夹'" aria-label="切换工作台文件夹" @click="chooseDirectory">
        {{ directory ? directory.split(/[\\/]/).filter(Boolean).at(-1) || directory : "选择文件夹" }}
      </el-button>
    </header>
    <div v-if="directory" class="shellBody">
      <slot :directory="directory" />
    </div>
    <div v-else class="shellEmpty">
      <p>生成的{{ type === "image" ? "图片" : "视频" }}会保存到你选择的文件夹，选一次之后会一直记住。</p>
      <el-button type="primary" :icon="IconFolder" :loading="picker?.selecting" @click="chooseDirectory">选择文件夹</el-button>
    </div>
    <workspacePicker ref="picker" hideTrigger />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import axios from "axios";
import { ElMessage } from "element-plus";
import { IconFolder } from "@tabler/icons-vue";
import { useWorkbenchStore, type WorkbenchType } from "@/stores/workbench";
import workspacePicker from "@/pages/home/workspacePicker.vue";

const props = defineProps<{ type: WorkbenchType; title: string }>();
const workbenchStore = useWorkbenchStore();
const picker = ref<InstanceType<typeof workspacePicker>>();
const directory = computed(() => workbenchStore.directories[props.type]);

async function chooseDirectory() {
  try {
    const path = await picker.value?.chooseDirectory();
    if (path) await workbenchStore.setDirectory(props.type, path);
  } catch (error) {
    ElMessage.error(axios.isAxiosError<{ message?: string }>(error) ? error.response?.data.message || "无法使用该文件夹" : error instanceof Error ? error.message : "无法使用该文件夹");
  }
}

defineExpose({ chooseDirectory });
</script>

<style lang="scss" scoped>
.workbenchShell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;

  .shellHeader {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 12px;
    padding: 16px 24px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    h1 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.5; }

    .directoryButton {
      max-width: 320px;
      margin-inline-start: auto;
      color: var(--el-text-color-secondary);

      :deep(> span) { overflow: hidden; text-overflow: ellipsis; }
    }
  }

  .shellBody { flex: 1; min-height: 0; }

  .shellEmpty {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    text-align: center;

    p { margin: 0; color: var(--el-text-color-secondary); font-size: 14px; line-height: 1.7; }
  }
}
</style>
