<template>
  <div v-if="status === 'running'" class="generationState running" role="status" aria-label="正在生成">
    <icon-loader2 class="loadingIcon" :size="16" aria-hidden="true" />
    <span>{{ resumed ? "正在恢复生成任务" : "正在生成" }}</span>
  </div>
  <div v-else-if="status === 'succeeded' && successVisible" class="generationState succeeded" role="status" aria-label="生成成功" title="生成成功">
    <icon-circle-check-filled :size="16" aria-hidden="true" />
  </div>
  <div v-else-if="status === 'failed'" class="generationFailed nodrag nopan" role="alert" @pointerdown.stop @dblclick.stop>
    <icon-alert-circle class="failedIcon" :size="16" aria-hidden="true" />
    <span class="failedMessage" :title="error">{{ error || "生成失败" }}</span>
    <el-button v-if="canRetry" size="small" :icon="IconRefresh" :disabled="disabled" @click.stop="emit('retry')">重试</el-button>
  </div>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, watch } from "vue";
import { ElButton } from "element-plus";
import { IconAlertCircle, IconCircleCheckFilled, IconLoader2, IconRefresh } from "@tabler/icons-vue";

const props = defineProps<{ status: "idle" | "running" | "succeeded" | "failed"; error?: string; canRetry?: boolean; disabled?: boolean; resumed?: boolean }>();
const emit = defineEmits<{ retry: [] }>();
const successVisible = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

// ACT: 成功图标显示 4 秒后淡出，避免长期占用预览区域。
watch(() => props.status, value => {
  clearTimeout(timer);
  successVisible.value = value === "succeeded";
  if (value === "succeeded") timer = setTimeout(() => { successVisible.value = false; }, 4000);
});
onScopeDispose(() => clearTimeout(timer));
</script>

<style scoped lang="scss">
@keyframes nodeLoading {
  to { transform: rotate(360deg); }
}

@keyframes stateFadeIn {
  from { opacity: 0; transform: translateY(-2px); }
}

.generationState {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--ui-radius-small, var(--el-border-radius-base));
  background: color-mix(in srgb, var(--el-bg-color) 88%, transparent);
  font-size: 12px;
  pointer-events: none;
  animation: stateFadeIn 120ms ease-out;

  &.running {
    color: var(--el-text-color-regular);
    .loadingIcon { color: var(--el-color-primary); animation: nodeLoading 1s linear infinite; }
  }

  &.succeeded {
    padding: 4px;
    color: var(--el-color-success);
    background: color-mix(in srgb, var(--el-color-success) 12%, var(--el-bg-color));
  }
}

.generationFailed {
  position: absolute;
  right: 8px;
  bottom: 8px;
  left: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--el-color-danger) 30%, transparent);
  border-radius: var(--el-border-radius-base);
  background: color-mix(in srgb, var(--el-color-danger) 12%, var(--el-bg-color));
  color: var(--el-text-color-primary);
  font-size: 12px;
  animation: stateFadeIn 120ms ease-out;

  .failedIcon { flex-shrink: 0; color: var(--el-color-danger); }
  .failedMessage { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .el-button { flex-shrink: 0; transition: transform 120ms ease-out; }
  .el-button:not(.is-disabled):hover { transform: translateY(-1px); }
}

@media (prefers-reduced-motion: reduce) {
  .generationState,
  .generationFailed,
  .generationState.running .loadingIcon { animation: none; }
  .generationFailed .el-button { transition: none; }
  .generationFailed .el-button:not(.is-disabled):hover { transform: none; }
}
</style>
