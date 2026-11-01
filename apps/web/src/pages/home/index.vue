<template>
  <div class="home" :inert="creating || opening || workspaceStore.projectLoadingVisible">
    <bg class="pageBackground" :scrollTop="backgroundScrollTop" />
    <el-scrollbar ref="pageScroll" class="pageScroll" @scroll="backgroundScrollTop = pageScroll?.wrapRef?.scrollTop ?? 0">
      <div class="pageBody">
        <el-main class="pageContent">
          <section class="creationPanel" data-home-section="home" aria-label="创建项目">
            <div class="brand">
              <el-image class="brandLogo" :src="logoUrl" fit="contain" alt="麦麦工坊" />
              <h1>今天要做点什么？</h1>
            </div>
            <div class="promptArea">
              <el-card class="promptCard" :class="{ draggingAttachments }" shadow="never" @dragenter.capture="dragEnterAttachments" @dragover.capture="dragOverAttachments" @dragleave.capture="dragLeaveAttachments" @drop.capture="dropAttachments">
                <div v-if="draggingAttachments" class="attachmentDropOverlay" role="status" aria-live="polite">
                  <icon-paperclip :size="20" aria-hidden="true" />
                  <strong>松开添加附件</strong>
                  <span>图片、视频、文档或代码文件</span>
                </div>
                <input ref="attachmentInput" type="file" :accept="attachmentAccept" multiple hidden :disabled="creating || opening" @change="selectAttachments" />
                <attachmentList v-if="promptAttachments.length" class="promptAttachments" :attachments="promptAttachments" removable restorable :disabled="creating || opening" @remove="promptAttachments.splice($event, 1)" @restore="restoreAttachment" />
                <el-input ref="promptInput" v-model="prompt" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" resize="none" :disabled="creating || opening" :placeholder="promptPlaceholder" aria-label="创作描述" @paste.capture="pasteAttachments" />
                <template #footer>
                  <div class="composerFooter">
                    <div class="composerTools">
                      <el-button class="attachmentButton" text circle :icon="IconPaperclip" :disabled="creating || opening" aria-label="添加附件" title="添加附件" @click="attachmentInput?.click()" />
                      <workspacePicker ref="promptWorkspacePicker" v-model="workspaceDirectory" :disabled="creating || opening" />
                    </div>
                    <div class="sendActions">
                      <modelPopover v-model="selectedModel" v-model:reasoningEffort="reasoningEffort" class="modelSelect" :disabled="creating || opening" />
                      <el-button class="sendButton" type="primary" :circle="!!workspaceDirectory" :icon="workspaceDirectory ? IconArrowUp : IconFolder" :loading="creating" :disabled="creating || opening" :aria-label="workspaceDirectory ? '发送' : '选择工作目录'" @click="workspaceDirectory ? createProject() : promptWorkspacePicker?.chooseDirectory()">
                        <template v-if="!workspaceDirectory" #default>选择工作目录</template>
                      </el-button>
                    </div>
                  </div>
                </template>
              </el-card>
              <p v-if="!workspaceDirectory" class="workspaceHint" role="status">请先选择一个空文件夹作为工作目录，画布和素材会保存在这里。</p>
            </div>
          </section>
          <nav class="entryList" aria-label="开始创作">
            <router-link v-for="entry in entries" :key="entry.path" class="entryCard" :to="entry.path">
              <span class="entryIcon"><component :is="entry.icon" :size="22" aria-hidden="true" /></span>
              <span class="entryText">
                <span class="entryTitle">{{ entry.title }}</span>
                <span class="entryDescription">{{ entry.description }}</span>
              </span>
            </router-link>
          </nav>
          <section v-if="recentProjects.length" class="recentList" aria-labelledby="recentListTitle">
            <div class="recentHeader">
              <h2 id="recentListTitle">最近项目</h2>
              <router-link class="viewAll" to="/projects">查看全部</router-link>
            </div>
            <div class="recentItems">
              <button v-for="project in recentProjects" :key="project.directory" class="recentCard" type="button" :disabled="creating || opening" :title="project.directory" :aria-label="`打开项目 ${project.name}`" @click="openProject(project)">
                <projectCover :directory="project.directory" />
                <span class="projectName" :title="project.name">{{ project.name }}</span>
              </button>
            </div>
          </section>
        </el-main>
      </div>
    </el-scrollbar>
    <workspacePicker ref="relocationPicker" hideTrigger />
  </div>
</template>

<script setup lang="ts">
import { locale, translate } from "@toonflow/i18n/vue";
import axios from "axios";
import { storeToRefs } from "pinia";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ElMessage, type InputInstance, type ScrollbarInstance } from "element-plus";
import { getReadableFileMimeType, readableFileAccept } from "@toonflow/server/documentFormats";
import { IconArrowUp, IconFolder, IconPaperclip, IconPhotoAi, IconMovie, IconInfinity } from "@tabler/icons-vue";
import modelPopover from "@/components/modelPopover.vue";
import attachmentList from "@/components/agent/attachmentList.vue";
import { createPastedTextFile, readTextAttachment } from "@/components/agent/textAttachments";
import type { AgentAttachment } from "@/components/agent/types";
import logoUrl from "@toonflow/assets/logo.png";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import bg from "./bg.vue";
import projectCover from "./projectCover.vue";
import workspacePicker from "./workspacePicker.vue";
import useProjectEntry from "./projectEntry";

const pageScroll = ref<ScrollbarInstance>();
const backgroundScrollTop = ref(0);
const { pageLifetime, creating, opening, relocationPicker, enterWorkspace, openProject } = useProjectEntry();
const promptWorkspacePicker = ref<InstanceType<typeof workspacePicker>>();
const entries = [
  { path: "/imageStudio", title: "生成图片", description: "写一句描述，直接出图", icon: IconPhotoAi },
  { path: "/videoStudio", title: "生成视频", description: "用文字或图片生成一段视频", icon: IconMovie },
  { path: "/projects", title: "无限画布", description: "在画布上编排分镜与工作流", icon: IconInfinity },
];
const prompt = ref("");
const promptInput = ref<InputInstance>();
const promptAttachments = ref<AgentAttachment[]>([]);
const attachmentInput = ref<HTMLInputElement>();
const attachmentAccept = `image/*,video/*,${readableFileAccept}`;
const draggingAttachments = ref(false);
let attachmentDragDepth = 0;
const workspaceStore = useWorkspaceStore();
const { project, projectList } = storeToRefs(workspaceStore);
const workspaceDirectory = ref(project.value?.directory ?? "");
const placeholderPhrases = [
  "描述你想创作的内容，让灵感从这里开始…",
  "把一个故事灵感，变成一段精彩的短片…",
  "为你的主角设计独特的外形和性格…",
  "创作一段雨夜街头的电影感镜头…",
  "把这段文字拆解成连贯的分镜画面…",
  "为一场奇幻冒险生成场景和角色…",
  "为你的画面配上一段合适的音乐…",
  "写一段温暖的旁白，讲述这个故事…",
  "设计一支富有想象力的产品宣传片…",
  "从一句话开始，搭建你的创作工作流…",
];
const promptPlaceholder = ref(translate(placeholderPhrases[0]!));

onMounted(() => {
  window.addEventListener("dragend", clearAttachmentDrag, true);
  window.addEventListener("drop", clearAttachmentDrag, true);
  window.addEventListener("blur", clearAttachmentDrag);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let phraseIndex = 0;
  watch([() => !!prompt.value, locale], ([hasInput], _previous, onCleanup) => {
    if (reduceMotion) {
      promptPlaceholder.value = translate(placeholderPhrases[0]!);
      return;
    }
    if (hasInput) return;
    const segmenter = new Intl.Segmenter(locale.value, { granularity: "grapheme" });
    const phrases = placeholderPhrases.map(phrase => [...segmenter.segment(translate(phrase))].map(part => part.segment));
    let characterCount = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    promptPlaceholder.value = "";

    function typePlaceholder() {
      const phrase = phrases[phraseIndex]!;
      characterCount += deleting ? -1 : 1;
      promptPlaceholder.value = phrase.slice(0, characterCount).join("");
      let delay = deleting ? 35 : 85;
      if (characterCount === phrase.length) {
        deleting = true;
        delay = 1800;
      } else if (characterCount === 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % placeholderPhrases.length;
        delay = 300;
      }
      timer = setTimeout(typePlaceholder, delay);
    }

    timer = setTimeout(typePlaceholder, 300);
    onCleanup(() => clearTimeout(timer));
  }, { immediate: true });
});

onUnmounted(() => {
  window.removeEventListener("dragend", clearAttachmentDrag, true);
  window.removeEventListener("drop", clearAttachmentDrag, true);
  window.removeEventListener("blur", clearAttachmentDrag);
});
watch([creating, opening], ([creating, opening]) => {
  if (creating || opening) clearAttachmentDrag();
}, { flush: "sync" });

const selectedModel = ref("");
const reasoningEffort = ref("");
const recentProjects = computed(() => [...projectList.value].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, 4));

function pasteAttachments(event: ClipboardEvent) {
  if (creating.value || opening.value) return;
  try {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) {
      const file = createPastedTextFile(event.clipboardData?.getData("text/plain") ?? "");
      if (file) files.push(file);
    }
    if (!files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    addAttachments(files);
  } catch (error) {
    event.preventDefault();
    event.stopImmediatePropagation();
    ElMessage.error(error instanceof Error ? error.message : "添加附件失败，请重试");
  }
}

function selectAttachments(event: Event) {
  const input = event.target as HTMLInputElement;
  addAttachments(Array.from(input.files ?? []));
  input.value = "";
}

function clearAttachmentDrag() {
  attachmentDragDepth = 0;
  draggingAttachments.value = false;
}

function dragEnterAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.stopPropagation();
  if (creating.value || opening.value) return clearAttachmentDrag();
  attachmentDragDepth++;
  draggingAttachments.value = true;
}

function dragOverAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = creating.value || opening.value ? "none" : "copy";
  if (creating.value || opening.value) return clearAttachmentDrag();
  attachmentDragDepth = Math.max(1, attachmentDragDepth);
  draggingAttachments.value = true;
}

function dragLeaveAttachments(event: DragEvent) {
  if (!draggingAttachments.value) return;
  attachmentDragDepth = Math.max(0, attachmentDragDepth - 1);
  const target = event.currentTarget;
  if (!attachmentDragDepth || (target instanceof Node && event.relatedTarget instanceof Node && !target.contains(event.relatedTarget))) clearAttachmentDrag();
}

function dropAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.stopPropagation();
  clearAttachmentDrag();
  addAttachments(Array.from(event.dataTransfer.files));
}

function addAttachments(files: File[]) {
  if (creating.value || opening.value) return;
  for (const file of files) {
    const readableMimeType = getReadableFileMimeType(file.name, file.type);
    const mimeType = readableMimeType ?? file.type.split(";")[0]!.trim().toLowerCase();
    if (!readableMimeType && !/^(image|video)\//.test(mimeType)) {
      ElMessage.warning("只支持图片、视频和受支持的文本或文档文件");
      continue;
    }
    if (!file.size || file.size > 100 * 1024 * 1024) {
      ElMessage.warning("附件不能为空且不能超过 100 MB");
      continue;
    }
    if (mimeType === "text/plain" && file.size > 400000) {
      ElMessage.warning("文本附件不能超过 400 KB（400000 字节），请缩减内容后重试。");
      continue;
    }
    if (promptAttachments.value.length >= 20) {
      ElMessage.warning("每条消息最多添加 20 个附件");
      break;
    }
    promptAttachments.value.push({ name: file.name, path: "", mimeType, file });
  }
}

async function restoreAttachment(index: number) {
  const attachment = promptAttachments.value[index];
  if (attachment?.mimeType !== "text/plain" || creating.value || opening.value) return;
  try {
    const text = await readTextAttachment(attachment);
    const currentIndex = promptAttachments.value.indexOf(attachment);
    if (currentIndex < 0 || creating.value || opening.value) return;
    prompt.value += `${prompt.value ? "\n" : ""}${text}`;
    promptAttachments.value.splice(currentIndex, 1);
    await nextTick();
    promptInput.value?.focus();
    promptInput.value?.textarea?.setSelectionRange(prompt.value.length, prompt.value.length);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "取回文本失败，请重试");
  }
}

async function createProject() {
  const path = workspaceDirectory.value;
  if (!path || creating.value || opening.value || pageLifetime.signal.aborted) return;
  creating.value = true;
  try {
    const { directory, empty } = await useWorkspaceFiles(path).list();
    if (!empty) return ElMessage.warning("该文件夹不为空，请重新选择空文件夹；已有项目请到“无限画布”打开。");
    await useWorkspaceFiles(directory).writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    await workspaceStore.openProject(directory);
    if (prompt.value.trim() || promptAttachments.value.length) {
      workspaceStore.pendingAgentMessage = { directory: workspaceStore.project!.directory, prompt: prompt.value, attachments: [...promptAttachments.value], model: selectedModel.value, reasoningEffort: reasoningEffort.value };
    }
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
.home {
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

    :deep(.el-scrollbar__view) { min-height: 100%; }

    .pageBody {
      position: relative;
      min-height: 100%;

      .pageContent {
        padding: 24px clamp(20px, 4vw, 56px) 56px;

        .creationPanel {
          max-width: 800px;
          margin: clamp(32px, 6vh, 64px) auto 36px;

          .brand {
            display: flex;
            align-items: center;
            gap: clamp(8px, 1vw, 12px);
            margin-bottom: 28px;

            .brandLogo {
              flex-shrink: 0;
              width: clamp(28px, 3.4vw, 44px);
              height: clamp(28px, 3.4vw, 44px);
            }

            h1 {
              margin: 0;
              font-size: clamp(22px, 3vw, 34px);
              font-weight: 500;
              line-height: 1.3;
              letter-spacing: -0.5px;
            }
          }

          .promptArea {
            position: relative;

            .promptCard {
              position: relative;
              border-radius: calc(var(--ui-radius) * 3);
              border-color: var(--el-border-color-light);
              background: color-mix(in srgb, var(--el-bg-color-overlay) 70%, transparent);
              box-shadow: 0 12px 36px rgb(0 0 0 / 6%), inset 0 1px 0 color-mix(in srgb, var(--el-text-color-primary) 4%, transparent);
              transition: border-color 0.2s, box-shadow 0.2s;

              &:focus-within, &.draggingAttachments {
                border-color: var(--el-color-primary-light-5);
                box-shadow: 0 12px 36px rgb(0 0 0 / 6%), 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 8%, transparent);
              }

              :deep(.el-card__body) {
                padding: 20px 22px 8px;
              }

              .attachmentDropOverlay {
                position: absolute;
                inset: 0;
                z-index: 2;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 4px;
                border-radius: inherit;
                background: var(--el-bg-color);
                color: var(--el-text-color-primary);
                pointer-events: none;

                > svg { color: var(--el-text-color-secondary); }
                strong { font-size: 14px; font-weight: 500; }
                span { color: var(--el-text-color-secondary); font-size: 12px; }
              }

              .promptAttachments {
                margin-bottom: 12px;
              }

              :deep(.el-textarea__inner) {
                padding: 4px 0;
                box-shadow: none;
                background: transparent;
                font-size: 15px;
                line-height: 1.9;
              }

              :deep(.el-card__footer) {
                padding: 8px 14px 14px;
                border-top: 0;
                background: transparent;
              }

              .composerFooter {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 10px;

                .composerTools {
                  display: flex;
                  align-items: center;
                  flex: 1 1 160px;
                  min-width: 0;
                  gap: 6px;

                  .attachmentButton {
                    flex-shrink: 0;
                    width: 36px;
                    height: 36px;
                    margin: 0;
                    background: var(--el-fill-color-light);
                    color: var(--el-text-color-regular);

                    &:hover:not(:disabled) {
                      background: var(--el-color-primary-light-9);
                      color: var(--el-color-primary);
                    }
                  }

                  :deep(.workspaceButton) {
                    max-width: calc(100% - 42px);
                    height: 36px;
                    margin: 0;
                    padding: 0 10px;
                    border-radius: calc(var(--ui-radius) * 2);
                    color: var(--el-text-color-secondary);
                  }
                }

                .sendActions {
                  display: flex;
                  align-items: center;
                  justify-content: flex-end;
                  min-width: 0;
                  max-width: 100%;
                  margin-inline-start: auto;
                  gap: 8px;

                  .modelSelect {
                    min-width: 0;
                    max-width: 280px;

                    :deep(.modelButton) {
                      height: 36px;
                      border-radius: calc(var(--ui-radius) * 2);
                    }
                  }

                  .sendButton {
                    flex-shrink: 0;
                    height: 38px;
                    margin: 0;
                    border-radius: calc(var(--ui-radius) * 2);

                    &.is-circle { width: 38px; border-radius: 50%; }
                  }
                }

                @media (max-width: 560px) {
                  .composerTools { flex-basis: 100%; }

                  .sendActions {
                    width: 100%;
                    justify-content: space-between;

                    .modelSelect { flex: 1; }
                  }
                }
              }

              @media (prefers-reduced-motion: reduce) {
                transition: none;
              }
            }

            .workspaceHint {
              margin: 12px 16px 0;
              color: var(--el-text-color-secondary);
              font-size: 12px;
              line-height: 1.7;
            }
          }
        }

        .entryList {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
          gap: 16px;
          max-width: 800px;
          margin: 0 auto 48px;

          .entryCard {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 18px 20px;
            border: 1px solid var(--el-border-color-lighter);
            border-radius: calc(var(--ui-radius) * 2.5);
            background: color-mix(in srgb, var(--el-bg-color-overlay) 70%, transparent);
            box-shadow: var(--el-box-shadow-lighter);
            color: inherit;
            text-decoration: none;
            transition: border-color 0.2s, transform 0.2s;

            &:hover { border-color: var(--el-color-primary-light-5); transform: translateY(-2px); }
            &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }

            .entryIcon {
              display: grid;
              place-items: center;
              flex-shrink: 0;
              width: 40px;
              height: 40px;
              border-radius: calc(var(--ui-radius) * 2);
              background: var(--el-color-primary-light-9);
              color: var(--el-color-primary);
            }

            .entryText {
              display: flex;
              flex-direction: column;
              gap: 2px;
              min-width: 0;

              .entryTitle { font-size: 15px; font-weight: 600; line-height: 1.6; }
              .entryDescription { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
            }

            @media (prefers-reduced-motion: reduce) {
              transition: none;

              &:hover { transform: none; }
            }
          }
        }

        .recentList {
          max-width: 800px;
          margin: 0 auto;

          .recentHeader {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            margin-bottom: 14px;

            h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.5; }

            .viewAll {
              color: var(--el-color-primary);
              font-size: 13px;
              text-decoration: none;

              &:hover { text-decoration: underline; }
              &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; border-radius: 2px; }
            }
          }

          .recentItems {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr));
            gap: 16px;

            .recentCard {
              display: flex;
              flex-direction: column;
              min-width: 0;
              padding: 0;
              overflow: hidden;
              border: 1px solid var(--el-border-color-lighter);
              border-radius: calc(var(--ui-radius) * 2);
              background: color-mix(in srgb, var(--el-bg-color-overlay) 70%, transparent);
              color: inherit;
              font: inherit;
              text-align: start;
              cursor: pointer;
              transition: border-color 0.2s;

              &:hover { border-color: var(--el-color-primary-light-5); }
              &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
              &:disabled { cursor: wait; opacity: 0.6; }

              .projectName {
                overflow: hidden;
                padding: 10px 12px;
                border-top: 1px solid var(--el-border-color-lighter);
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 13px;
                font-weight: 500;
                line-height: 1.5;
              }

              @media (prefers-reduced-motion: reduce) {
                transition: none;
              }
            }
          }
        }
      }
    }
  }

  @media (max-width: 560px) {
    .pageScroll .pageBody .pageContent { padding: 24px 16px 40px; }
  }
}
</style>
