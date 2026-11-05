<template>
  <el-button :icon="IconInfoCircle" :disabled="!src" text title="图片信息" aria-label="图片信息" @click.stop="info?.open($event)">信息</el-button>
  <el-dropdown trigger="click" placement="bottom" :disabled="disabled || !src" :showArrow="false" @command="runCommand">
    <el-button :icon="IconDots" :disabled="disabled || !src" :loading="busy" text title="更多图片工具" aria-label="更多图片工具" @click.stop>更多</el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="crop" :icon="IconCrop">裁剪</el-dropdown-item>
        <el-dropdown-item command="upscale" :icon="IconArrowsMaximize">放大</el-dropdown-item>
        <el-dropdown-item command="reverse" :icon="IconWand">反推提示词</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  <imageCrop ref="crop" :src="src" :disabled="disabled" />
  <imageUpscale ref="upscale" :src="src" :disabled="disabled" />
  <imageInfo ref="info" :src="src" :source="source" :prompt="prompt" :active="active" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu, ElMessage } from "element-plus";
import { IconArrowsMaximize, IconCrop, IconDots, IconInfoCircle, IconWand } from "@tabler/icons-vue";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/runtime";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import imageCrop from "./imageCrop.vue";
import imageUpscale from "./imageUpscale.vue";
import imageInfo from "./imageInfo.vue";
import { useReversePrompt } from "../useReversePrompt";

const props = defineProps<{ src: string; source?: NodeMediaValue; prompt?: string; disabled?: boolean; active: boolean }>();
const crop = ref<InstanceType<typeof imageCrop>>();
const upscale = ref<InstanceType<typeof imageUpscale>>();
const info = ref<InstanceType<typeof imageInfo>>();
const createReversePrompt = useReversePrompt();
const creatingPrompt = ref(false);
const busy = computed(() => !!crop.value?.busy || !!upscale.value?.busy || creatingPrompt.value);

defineExpose({ busy });

function runCommand(command: "crop" | "upscale" | "reverse") {
  if (command === "crop") crop.value?.open();
  else if (command === "upscale") upscale.value?.open();
  else void reverse();
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
