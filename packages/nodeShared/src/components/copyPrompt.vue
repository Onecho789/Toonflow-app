<template>
  <el-button :icon="IconCopy" :disabled="disabled || !text.trim()" text title="复制提示词" aria-label="复制提示词" @click.stop="copyPrompt">复制提示词</el-button>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { ElButton, ElMessage } from "element-plus";
import { IconCopy } from "@tabler/icons-vue";
import { showNodeError } from "../showNodeError";

const props = defineProps<{ text: string; disabled?: boolean }>();
// 宿主提供跨平台剪贴板写入（桌面端走本地接口），独立运行时退回浏览器剪贴板
const writeClipboardText = inject<(text: string) => Promise<void>>("writeClipboardText", text => navigator.clipboard.writeText(text));

async function copyPrompt() {
  try {
    await writeClipboardText(props.text);
    ElMessage.success("提示词已复制");
  } catch (error) {
    showNodeError(error, "复制提示词失败");
  }
}
</script>
