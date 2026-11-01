<template>
  <section class="workbenchShell" :aria-label="title">
    <bg class="shellBackground" still />
    <header class="shellHeader">
      <span class="titleIcon"><component :is="type === 'image' ? IconPhotoAi : IconMovie" :size="20" aria-hidden="true" /></span>
      <div class="titleText">
        <h1>{{ title }}</h1>
        <p>{{ type === "image" ? "一句描述直接出图，满意的一键加入素材库" : "文字或首尾帧生成视频，满意的一键加入素材库" }}</p>
      </div>
      <el-button v-if="directory" class="directoryButton" round :icon="IconFolder" :loading="picker?.selecting" :title="`${directory}\n点击切换文件夹`" aria-label="切换工作台文件夹" @click="chooseDirectory">
        <span class="directoryName">{{ directory.split(/[\\/]/).filter(Boolean).at(-1) || directory }}</span>
        <icon-switch-horizontal :size="14" aria-hidden="true" />
      </el-button>
    </header>
    <div v-if="directory" class="shellBody">
      <slot :directory="directory" />
    </div>
    <div v-else class="shellEmpty">
      <div class="emptyCard">
        <span class="emptyIcon"><icon-folder-heart :size="40" stroke="1.4" aria-hidden="true" /></span>
        <h2>先选一个文件夹存放作品</h2>
        <p>生成的{{ type === "image" ? "图片" : "视频" }}会直接保存到这个文件夹，选一次就会记住，之后随时可以切换。</p>
        <ul class="emptyFeatures">
          <li><icon-device-floppy :size="16" aria-hidden="true" />作品存在本地，随时可查看</li>
          <li><icon-library-photo :size="16" aria-hidden="true" />挑中的一键加入素材库</li>
          <li><icon-infinity :size="16" aria-hidden="true" />素材库可直接在画布中使用</li>
        </ul>
        <el-button type="primary" size="large" round :icon="IconFolder" :loading="picker?.selecting" @click="chooseDirectory">选择文件夹</el-button>
      </div>
    </div>
    <workspacePicker ref="picker" hideTrigger />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import axios from "axios";
import { ElMessage } from "element-plus";
import { IconDeviceFloppy, IconFolder, IconFolderHeart, IconInfinity, IconLibraryPhoto, IconMovie, IconPhotoAi, IconSwitchHorizontal } from "@tabler/icons-vue";
import { useWorkbenchStore, type WorkbenchType } from "@/stores/workbench";
import workspacePicker from "@/pages/home/workspacePicker.vue";
import bg from "@/pages/home/bg.vue";

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
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;

  .shellBackground {
    position: absolute;
    inset: 0;
  }

  .shellHeader, .shellBody, .shellEmpty { position: relative; }

  .shellHeader {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 12px;
    padding: 18px 24px 2px;

    .titleIcon {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
      color: #fff;
      box-shadow: 0 6px 16px color-mix(in srgb, var(--el-color-primary) 30%, transparent);
    }

    .titleText {
      min-width: 0;

      h1 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.4; }
      p { margin: 2px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
    }

    .directoryButton {
      max-width: 320px;
      margin-inline-start: auto;

      :deep(> span) { display: flex; align-items: center; gap: 6px; min-width: 0; }

      .directoryName { overflow: hidden; text-overflow: ellipsis; }
      svg { flex-shrink: 0; color: var(--el-text-color-secondary); }
    }
  }

  .shellBody { flex: 1; min-height: 0; }

  .shellEmpty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 24px;

    .emptyCard {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      width: min(100%, 460px);
      padding: 40px 32px 36px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: calc(var(--ui-radius) * 3);
      background:
        radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--el-color-primary) 12%, transparent), transparent 55%),
        var(--el-bg-color-overlay);
      box-shadow: var(--el-box-shadow-light);
      text-align: center;
      box-sizing: border-box;

      .emptyIcon {
        display: grid;
        place-items: center;
        width: 80px;
        height: 80px;
        margin-bottom: 4px;
        border-radius: 24px;
        background: linear-gradient(135deg, var(--el-color-primary-light-8), var(--el-color-primary-light-9));
        color: var(--el-color-primary);
      }

      h2 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.5; }
      p { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.7; }

      .emptyFeatures {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 8px 0 12px;
        padding: 0;
        list-style: none;
        color: var(--el-text-color-regular);
        font-size: 13px;

        li {
          display: flex;
          align-items: center;
          gap: 8px;

          svg { color: var(--el-color-success); }
        }
      }
    }
  }
}
</style>
