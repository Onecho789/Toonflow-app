<template>
  <section class="workbenchShell" :aria-label="title">
    <bg class="shellBackground" still />
    <header class="shellHeader">
      <span class="titleIcon"><component :is="type === 'image' ? IconPhotoAi : IconMovie" :size="20" aria-hidden="true" /></span>
      <div class="titleText">
        <h1>{{ title }}</h1>
        <p>{{ type === "image" ? "一句描述直接出图，满意的一键加入素材库" : "文字或首尾帧生成视频，满意的一键加入素材库" }}</p>
      </div>
      <el-popover v-if="directory" v-model:visible="foldersVisible" placement="bottom-end" :width="380" trigger="click" :showArrow="false" popperClass="workbenchFolders">
        <template #reference>
          <el-button class="directoryButton" round :icon="IconFolder" :loading="picker?.selecting" :title="directory" aria-label="工作台文件夹">
            <span class="directoryName">{{ folderName(directory) }}</span>
            <icon-chevron-down :size="14" aria-hidden="true" />
          </el-button>
        </template>
        <div class="folderPanel">
          <div class="panelHeader">
            <span>用过的文件夹</span>
            <el-button size="small" round :icon="IconFolderPlus" :loading="picker?.selecting" @click="chooseDirectory">选择其他文件夹</el-button>
          </div>
          <ul class="folderList" aria-label="用过的文件夹">
            <li v-for="item in folders" :key="item.directory" class="folderItem" :class="{ active: item.directory === directory }">
              <button type="button" class="folderMain" :aria-current="item.directory === directory" :title="item.directory" @click="switchFolder(item.directory)">
                <icon-folder :size="18" aria-hidden="true" />
                <span class="folderText">
                  <span class="folderTitle">{{ folderName(item.directory) }}</span>
                  <span class="folderPath">{{ item.directory }}</span>
                </span>
                <icon-check v-if="item.directory === directory" class="checkIcon" :size="16" aria-hidden="true" />
              </button>
              <el-dropdown trigger="click" placement="bottom-end" @command="(command: string) => folderAction(command, item.directory)">
                <el-button class="moreButton" text circle size="small" :icon="IconDots" :aria-label="`${folderName(item.directory)} 的更多操作`" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="reveal" :icon="IconFolderOpen">在文件管理器中打开</el-dropdown-item>
                    <el-dropdown-item command="remove" :icon="IconX">从列表移除</el-dropdown-item>
                    <el-dropdown-item command="delete" :icon="IconTrash" divided class="dangerItem">删除文件夹中的作品</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </li>
          </ul>
        </div>
      </el-popover>
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
        <div v-if="folders.length" class="recentFolders">
          <span class="recentTitle">或继续使用用过的文件夹</span>
          <button v-for="item in folders.slice(0, 5)" :key="item.directory" type="button" class="recentItem" :title="item.directory" @click="switchFolder(item.directory)">
            <icon-folder :size="16" aria-hidden="true" />
            <span class="folderTitle">{{ folderName(item.directory) }}</span>
            <span class="folderPath">{{ item.directory }}</span>
          </button>
        </div>
      </div>
    </div>
    <workspacePicker ref="picker" hideTrigger />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import axios from "axios";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconCheck, IconChevronDown, IconDeviceFloppy, IconDots, IconFolder, IconFolderHeart, IconFolderOpen, IconFolderPlus, IconInfinity, IconLibraryPhoto, IconMovie, IconPhotoAi, IconTrash, IconX } from "@tabler/icons-vue";
import { useWorkbenchStore, type WorkbenchType } from "@/stores/workbench";
import { forgetHistory } from "@/stores/workbenchHistory";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import workspacePicker from "@/pages/home/workspacePicker.vue";
import bg from "@/pages/home/bg.vue";

const props = defineProps<{ type: WorkbenchType; title: string }>();
const workbenchStore = useWorkbenchStore();
const picker = ref<InstanceType<typeof workspacePicker>>();
const foldersVisible = ref(false);
const directory = computed(() => workbenchStore.directories[props.type]);
// 旧版本只记了当前文件夹，没有列表时补上当前文件夹。
const folders = computed(() => {
  const list = workbenchStore.folders?.[props.type] ?? [];
  return directory.value && !list.some(item => item.directory === directory.value) ? [{ directory: directory.value, usedAt: 0 }, ...list] : list;
});
const kindText = computed(() => props.type === "image" ? "图片" : "视频");

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) || path;
const errorText = (error: unknown, fallback: string) => axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || fallback : error instanceof Error ? error.message : fallback;

async function chooseDirectory() {
  foldersVisible.value = false;
  try {
    const path = await picker.value?.chooseDirectory();
    if (path) await workbenchStore.setDirectory(props.type, path);
  } catch (error) {
    ElMessage.error(errorText(error, "无法使用该文件夹"));
  }
}

// 切换前重新校验，文件夹被移动或删除时提示并从列表移除。
async function switchFolder(path: string) {
  foldersVisible.value = false;
  if (path === directory.value) return;
  try {
    await workbenchStore.setDirectory(props.type, path);
  } catch (error) {
    workbenchStore.removeFolder(props.type, path);
    ElMessage.error(`${errorText(error, "文件夹已不存在")}，已从列表移除`);
  }
}

async function folderAction(command: string, path: string) {
  if (command === "reveal") {
    try { await useWorkspaceFiles(path).reveal(""); } catch (error) { ElMessage.error(errorText(error, "无法打开文件夹")); }
    return;
  }
  if (command === "remove") {
    workbenchStore.removeFolder(props.type, path);
    ElMessage.success("已从列表移除，文件夹里的文件都还在");
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将永久删除「${folderName(path)}」里工作台生成的${kindText.value}、参考素材和生成记录，删除后无法恢复。文件夹里的其他文件会保留；删完为空时文件夹也一起删除。`,
      "删除文件夹中的作品",
      { type: "warning", confirmButtonText: "永久删除", cancelButtonText: "取消", confirmButtonClass: "el-button--danger" },
    );
  } catch { return; }
  try {
    const { data } = await axios.delete<{ data: { removedFolder: boolean } }>("/api/workbench/removeFolder", { data: { directory: path }, headers: { "x-toonflow-workspace": "1" } });
    forgetHistory(path);
    workbenchStore.removeFolder(props.type, path);
    ElMessage.success(data.data.removedFolder ? "已删除文件夹" : "已删除工作台作品，文件夹里的其他文件已保留");
  } catch (error) {
    ElMessage.error(errorText(error, "删除失败"));
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

      .recentFolders {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
        margin-top: 8px;
        padding-top: 16px;
        border-top: 1px solid var(--el-border-color-lighter);
        text-align: start;

        .recentTitle { color: var(--el-text-color-secondary); font-size: 12px; }

        .recentItem {
          display: grid;
          grid-template-columns: auto auto 1fr;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: 1px solid var(--el-border-color-lighter);
          border-radius: var(--ui-radius);
          background: var(--el-fill-color-lighter);
          color: var(--el-text-color-regular);
          font: inherit;
          font-size: 13px;
          text-align: start;
          cursor: pointer;

          &:hover, &:focus-visible { border-color: var(--el-color-primary-light-5); color: var(--el-color-primary); }

          .folderTitle { font-weight: 500; white-space: nowrap; }
          .folderPath { overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        }
      }
    }
  }
}
</style>

<style lang="scss">
// 弹层挂在 body 上，不能用 scoped。
.workbenchFolders.el-popover {
  padding: 12px;

  .folderPanel {
    .panelHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    .folderList {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 360px;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;

      .folderItem {
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: var(--ui-radius);

        &:hover, &:focus-within { background: var(--el-fill-color-light); }
        &.active { background: var(--el-color-primary-light-9); }

        .folderMain {
          display: flex;
          flex: 1;
          align-items: center;
          gap: 10px;
          min-width: 0;
          padding: 8px 10px;
          border: 0;
          background: none;
          color: var(--el-text-color-regular);
          font: inherit;
          text-align: start;
          cursor: pointer;

          > svg { flex-shrink: 0; color: var(--el-text-color-secondary); }

          .folderText {
            display: flex;
            flex: 1;
            flex-direction: column;
            min-width: 0;

            .folderTitle { overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
            .folderPath { overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
          }

          .checkIcon { color: var(--el-color-primary); }
        }

        .moreButton { flex-shrink: 0; margin-inline-end: 4px; }
      }
    }
  }
}

.el-dropdown-menu__item.dangerItem { color: var(--el-color-danger); }
</style>
