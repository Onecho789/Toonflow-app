<template>
  <el-button v-if="visible('info')" :icon="IconInfoCircle" :disabled="!src" text title="图片信息" aria-label="图片信息" @click.stop="info?.open($event)">信息</el-button>
  <el-button v-if="visible('crop')" :icon="IconCrop" :disabled="disabled || !src" text title="裁剪" aria-label="裁剪" @click.stop="crop?.open()">裁剪</el-button>
  <el-button v-if="visible('upscale')" :icon="IconArrowsMaximize" :disabled="disabled || !src" :loading="upscale?.busy" text title="放大" aria-label="放大" @click.stop="upscale?.open()">放大</el-button>
  <el-button v-if="visible('superResolve')" :icon="IconSparkles" :disabled="disabled || !src" :loading="superResolve?.busy" text title="AI 超分" aria-label="AI 超分" @click.stop="superResolve?.open()">AI 超分</el-button>
  <el-button v-if="visible('reversePrompt')" :icon="IconWand" :disabled="disabled || !src" :loading="creatingPrompt" text title="反推提示词" aria-label="反推提示词" @click.stop="reverse">反推提示词</el-button>
  <el-dropdown trigger="click" placement="bottom" :showArrow="false" @command="runCommand">
    <el-button ref="moreButton" :icon="IconDots" :loading="busy" text title="更多图片工具" aria-label="更多图片工具" @click.stop>更多</el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-for="tool in hiddenTools" :key="tool.id" :command="tool.id" :icon="tool.icon" :disabled="itemDisabled(tool.id)">{{ tool.label }}</el-dropdown-item>
        <el-dropdown-item command="customize" :icon="IconAdjustmentsHorizontal" :divided="!!hiddenTools.length">自定义工具栏</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  <imageCrop ref="crop" :src="src" :disabled="disabled" />
  <imageUpscale ref="upscale" :src="src" :disabled="disabled" />
  <imageSuperResolve ref="superResolve" :src="src" :disabled="disabled" />
  <imageInfo ref="info" :src="src" :source="source" :prompt="prompt" :active="active" />
  <imageToolbarSettings ref="settingsDialog" :tools="availableIds" />
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu, ElMessage } from "element-plus";
import { IconAdjustmentsHorizontal, IconArrowsMaximize, IconCrop, IconDots, IconInfoCircle, IconSparkles, IconWand } from "@tabler/icons-vue";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/runtime";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import imageCrop from "./imageCrop.vue";
import imageUpscale from "./imageUpscale.vue";
import imageSuperResolve from "./imageSuperResolve.vue";
import imageInfo from "./imageInfo.vue";
import imageToolbarSettings from "./imageToolbarSettings.vue";
import { useReversePrompt } from "../useReversePrompt";
import { imageTools, useImageToolbar, type ImageToolId } from "../imageToolbar";

// tools 为宿主节点自己渲染的工具；隐藏后由“更多”菜单通过 command 事件交回宿主执行。
const props = defineProps<{ src: string; source?: NodeMediaValue; prompt?: string; disabled?: boolean; active: boolean; tools: ImageToolId[] }>();
const emit = defineEmits<{ command: [id: ImageToolId, anchor: HTMLElement] }>();
const ownTools: ImageToolId[] = ["info", "crop", "upscale", "superResolve", "reversePrompt"];
const { visible } = useImageToolbar();
const crop = ref<InstanceType<typeof imageCrop>>();
const upscale = ref<InstanceType<typeof imageUpscale>>();
const superResolve = ref<InstanceType<typeof imageSuperResolve>>();
const info = ref<InstanceType<typeof imageInfo>>();
const settingsDialog = ref<InstanceType<typeof imageToolbarSettings>>();
const moreButton = ref<InstanceType<typeof ElButton>>();
const createReversePrompt = useReversePrompt();
const writeClipboardText = inject<(text: string) => Promise<void>>("writeClipboardText", text => navigator.clipboard.writeText(text));
const creatingPrompt = ref(false);
const busy = computed(() => !!crop.value?.busy || !!upscale.value?.busy || !!superResolve.value?.busy || creatingPrompt.value);
const availableIds = computed(() => [...props.tools, ...ownTools]);
const hiddenTools = computed(() => imageTools.filter(tool => availableIds.value.includes(tool.id) && !visible(tool.id)));

defineExpose({ busy });

function itemDisabled(id: ImageToolId) {
  if (id === "info") return !props.src;
  if (id === "copyPrompt") return !props.prompt?.trim();
  if (ownTools.includes(id)) return props.disabled || !props.src;
  return false;
}

function runCommand(command: ImageToolId | "customize") {
  const anchor = moreButton.value?.ref as HTMLElement;
  if (command === "customize") settingsDialog.value?.open();
  else if (command === "info") info.value?.open(anchor);
  else if (command === "crop") crop.value?.open();
  else if (command === "upscale") upscale.value?.open();
  else if (command === "superResolve") superResolve.value?.open();
  else if (command === "reversePrompt") void reverse();
  else if (command === "copyPrompt") void copyPrompt();
  else emit("command", command, anchor);
}

async function copyPrompt() {
  try {
    await writeClipboardText(props.prompt ?? "");
    ElMessage.success("提示词已复制");
  } catch (error) {
    showNodeError(error, "复制提示词失败");
  }
}

async function reverse() {
  if (props.disabled || !props.src || creatingPrompt.value) return;
  creatingPrompt.value = true;
  try {
    await createReversePrompt();
    ElMessage.success("已新建反推提示词文本节点，选择模型后点击生成");
  } catch (error) {
    showNodeError(error, "反推提示词失败");
  } finally {
    creatingPrompt.value = false;
  }
}
</script>
