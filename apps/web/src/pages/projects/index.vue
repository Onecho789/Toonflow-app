<template>
  <div class="projects" :inert="creating || opening || workspaceStore.projectLoadingVisible">
    <bg class="pageBackground" still />
    <el-scrollbar class="pageScroll">
      <el-main class="pageContent">
        <section class="projectList" aria-labelledby="projectListTitle">
          <h1 id="projectListTitle">无限画布</h1>
          <div class="projectItems">
            <el-card class="projectCard" shadow="never" :bodyStyle="{ padding: '0', height: '100%' }">
              <button class="projectLaunch" type="button" :disabled="creating || opening || relocationPicker?.selecting" :aria-busy="creating || relocationPicker?.selecting" title="选择空文件夹新建，或打开已有项目" @click="createProject">
                <span class="launchIcon">
                  <icon-loader-2 v-if="creating || relocationPicker?.selecting" class="isLoading" :size="24" aria-hidden="true" />
                  <icon-plus v-else :size="24" aria-hidden="true" />
                </span>
                <span class="launchText">
                  <span class="launchTitle">新建项目</span>
                  <span class="launchDescription">或打开已有项目</span>
                </span>
              </button>
            </el-card>
            <el-card v-for="project in sortedProjects" :key="project.directory" class="projectCard" shadow="never" :bodyStyle="{ padding: '0', height: '100%' }">
              <button class="projectEntry" type="button" :disabled="creating || opening" :title="project.directory" :aria-label="`打开项目 ${project.name}`" @click="openProject(project)">
                <projectCover :directory="project.directory" />
                <span class="projectInfo">
                  <span class="projectName" :title="project.name">{{ project.name }}</span>
                  <span class="projectTime">最近打开 {{ new Date(project.lastOpenedAt).toLocaleString(locale, { hour12: false }) }}</span>
                </span>
              </button>
              <div class="projectActions" :class="{ exporting: exportingDirectory === project.directory || coverMenuDirectory === project.directory || coverSavingDirectory === project.directory }">
                <el-dropdown trigger="click" :disabled="creating || opening || !!coverSavingDirectory" @visibleChange="coverMenuDirectory = $event ? project.directory : ''" @command="(command: string) => coverCommand(project, command)">
                  <el-button circle :icon="IconPhotoEdit" :loading="coverSavingDirectory === project.directory" :disabled="creating || opening || !!coverSavingDirectory" :aria-label="`设置项目 ${project.name} 的封面`" title="自定义封面" />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="upload" :icon="IconUpload">上传图片</el-dropdown-item>
                      <el-dropdown-item command="pick" :icon="IconPhoto">从项目图片选择</el-dropdown-item>
                      <el-dropdown-item command="reset" :icon="IconRefresh" divided>恢复自动封面</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button circle :icon="IconFileZip" :loading="exportingDirectory === project.directory" :disabled="creating || opening || !!exportingDirectory" :aria-label="`打包导出项目 ${project.name}`" title="打包导出 ZIP" @click="exportProject(project)" />
                <el-button circle :icon="IconEdit" :disabled="creating || opening || exportingDirectory === project.directory" :aria-label="`重命名项目 ${project.name}`" title="重命名" @click="renameProject(project)" />
                <el-button circle plain type="danger" :icon="IconTrash" :disabled="creating || opening || exportingDirectory === project.directory" :aria-label="`移除项目 ${project.name}`" title="从列表移除，不删除文件" @click="workspaceStore.removeProject(project.directory)" />
              </div>
            </el-card>
          </div>
        </section>
      </el-main>
    </el-scrollbar>
    <workspacePicker ref="relocationPicker" hideTrigger />
    <input ref="coverInput" type="file" accept="image/*" hidden aria-label="选择封面图片" @change="uploadCover" />
    <projectCoverPicker :directory="pickingDirectory" @close="pickingDirectory = undefined" @saved="ElMessage.success('封面已更新')" />
  </div>
</template>

<script setup lang="ts">
import { locale, translate } from "@toonflow/i18n/vue";
import axios from "axios";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconEdit, IconFileZip, IconPhoto, IconPhotoEdit, IconRefresh, IconTrash, IconUpload } from "@tabler/icons-vue";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import saveFile from "@/lib/saveFile";
import projectCover from "@/pages/home/projectCover.vue";
import bg from "@/pages/home/bg.vue";
import workspacePicker from "@/pages/home/workspacePicker.vue";
import useProjectEntry from "@/pages/home/projectEntry";
import { clearProjectCover, setProjectCover } from "@/pages/home/projectCoverFile";
import projectCoverPicker from "./projectCoverPicker.vue";

const workspaceStore = useWorkspaceStore();
const { projectList } = storeToRefs(workspaceStore);
const { pageLifetime, creating, opening, relocationPicker, enterWorkspace, openProject } = useProjectEntry();
const exportingDirectory = ref("");
const coverMenuDirectory = ref("");
const coverSavingDirectory = ref("");
const pickingDirectory = ref<string>();
const coverInput = ref<HTMLInputElement>();
let uploadingDirectory = "";
const sortedProjects = computed(() => [...projectList.value].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt));

async function exportProject(project: Project) {
  if (creating.value || opening.value || exportingDirectory.value) return;
  const directory = project.directory;
  exportingDirectory.value = directory;
  try {
    let name = project.name.replace(/[<>:"/\\|?*\x00-\x1f\x7f-\x9f]/g, "_").slice(0, 120).replace(/[. ]+$/, "");
    if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = "麦麦工坊";
    const files = useWorkspaceFiles(directory);
    await saveFile(() => files.exportZip(pageLifetime.signal), `${name}.zip`);
  } catch (error) {
    if (pageLifetime.signal.aborted) return;
    let message = error instanceof Error ? error.message : translate("导出项目失败，请重试");
    if (axios.isAxiosError(error)) {
      const data = error.response?.data instanceof Blob
        ? await error.response.data.text().then(JSON.parse).catch(() => null) : error.response?.data;
      if (typeof data?.message === "string") message = data.message;
    }
    ElMessage.error(message);
  } finally { exportingDirectory.value = ""; }
}

// 自定义封面写入项目文件夹，随项目复制、导出；恢复自动即删除该文件。
async function changeCover(directory: string, action: () => Promise<void>, done: string) {
  coverSavingDirectory.value = directory;
  try {
    await action();
    if (!pageLifetime.signal.aborted) ElMessage.success(done);
  } catch (error) {
    if (pageLifetime.signal.aborted) return;
    ElMessage.error(axios.isAxiosError<{ message?: string }>(error)
      ? error.response?.data.message || "封面设置失败，请重试"
      : error instanceof Error ? error.message : "封面设置失败，请重试");
  } finally { coverSavingDirectory.value = ""; }
}

function coverCommand(project: Project, command: string) {
  if (command === "upload") {
    uploadingDirectory = project.directory;
    coverInput.value?.click();
  } else if (command === "pick") pickingDirectory.value = project.directory;
  else if (command === "reset") void changeCover(project.directory, () => clearProjectCover(project.directory), "已恢复自动封面");
}

function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  const directory = uploadingDirectory;
  uploadingDirectory = "";
  if (!file || !directory) return;
  if (!file.type.startsWith("image/")) return void ElMessage.warning("请选择图片文件");
  void changeCover(directory, () => setProjectCover(directory, file), "封面已更新");
}

async function renameProject(project: Project) {
  const result = await ElMessageBox.prompt("请输入项目名称", "重命名项目", {
    inputValue: project.name, confirmButtonText: "保存", cancelButtonText: "取消",
    inputValidator: value => !!value?.trim() || "项目名称不能为空",
  }).catch(() => null);
  if (result) workspaceStore.renameProject(project.directory, result.value);
}

// 选择空文件夹新建项目，非空文件夹按已有项目打开。
async function createProject() {
  if (creating.value || opening.value) return;
  const path = await relocationPicker.value?.chooseDirectory();
  if (!path || creating.value || opening.value || pageLifetime.signal.aborted) return;
  creating.value = true;
  try {
    const { directory, empty } = await useWorkspaceFiles(path).list();
    if (empty) await useWorkspaceFiles(directory).writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    await workspaceStore.openProject(directory);
    await enterWorkspace();
  } catch (err) {
    ElMessage.error(axios.isAxiosError<{ message?: string }>(err)
      ? err.response?.data.message || "无法打开或创建项目，请重试"
      : err instanceof Error ? err.message : "无法打开或创建项目，请重试");
  } finally {
    creating.value = false;
  }
}
</script>

<style lang="scss" scoped>
.projects {
  position: relative;
  display: flex;
  height: 100%;
  overflow: hidden;

  .pageBackground {
    position: absolute;
    inset: 0;
  }

  .pageScroll {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;

    .pageContent {
      padding: 32px clamp(20px, 4vw, 56px) 56px;

      .projectList {
        max-width: 1280px;
        margin: 0 auto;

        h1 {
          margin: 0 0 24px;
          font-size: 24px;
          font-weight: 600;
          line-height: 1.5;
        }

        .projectItems {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
          grid-auto-rows: 1fr;
          gap: 20px;

          .projectCard {
            position: relative;
            border-radius: calc(var(--ui-radius) * 2.5);
            border-color: var(--el-border-color-lighter);
            background: color-mix(in srgb, var(--el-bg-color-overlay) 70%, transparent);
            box-shadow: var(--el-box-shadow-lighter);

            &:focus-within {
              border-color: var(--el-color-primary-light-5);
            }

            .projectLaunch, .projectEntry {
              width: 100%;
              height: 100%;
              min-height: 240px;
              border: 0;
              border-radius: calc(var(--ui-radius) * 2.5);
              background: transparent;
              color: inherit;
              font: inherit;
              cursor: pointer;

              &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
              &:disabled { cursor: wait; opacity: 0.6; }
            }

            .projectLaunch {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 12px;
              padding: 20px;
              text-align: center;

              .launchIcon {
                display: grid;
                place-items: center;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: var(--el-color-primary);
                color: var(--el-color-white);

                .isLoading { animation: launchSpin 1.5s linear infinite; }

                @media (prefers-reduced-motion: reduce) {
                  .isLoading { animation: none; }
                }
              }

              .launchText {
                display: flex;
                flex-direction: column;
                gap: 6px;

                .launchTitle { font-size: 15px; font-weight: 500; line-height: 1.8; }
                .launchDescription { color: var(--el-text-color-regular); font-size: 13px; line-height: 1.6; }
              }
            }

            .projectEntry {
              display: flex;
              flex-direction: column;
              padding: 0;
              text-align: start;

              .projectInfo {
                display: flex;
                flex-direction: column;
                gap: 6px;
                width: 100%;
                min-width: 0;
                margin-top: auto;
                padding: 12px 16px;
                border-top: 1px solid var(--el-border-color-lighter);
                background: transparent;

                .projectName {
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                  font-size: 14px;
                  font-weight: 600;
                  line-height: 1.5;
                }

                .projectTime { font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
              }
            }

            .projectActions {
              position: absolute;
              top: 12px;
              right: 12px;
              display: flex;
              gap: 4px;
              opacity: 0;
              pointer-events: none;
              transition: opacity 0.2s;

              .el-button {
                width: 32px;
                height: 32px;
                margin: 0;
                padding: 0;
                box-shadow: var(--el-box-shadow-lighter);
              }
            }

            &:hover .projectActions, &:focus-within .projectActions, .projectActions.exporting { opacity: 1; pointer-events: auto; }

            @media (hover: none), (any-pointer: coarse) {
              .projectActions { opacity: 1; pointer-events: auto; }
            }

            @media (prefers-reduced-motion: reduce) {
              .projectActions { transition: none; }
            }
          }
        }
      }
    }
  }

  @media (max-width: 560px) {
    .pageScroll .pageContent { padding: 24px 16px 40px; }
  }
}
@keyframes launchSpin {
  to { transform: rotate(360deg); }
}
</style>
