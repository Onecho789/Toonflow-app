<template>
  <div class="modelPopover">
    <el-popover
      v-model:visible="visible"
      trigger="click"
      placement="top-start"
      :width="340"
      :offset="10"
      :showArrow="false"
      popperClass="agentModelPopover"
      :popperStyle="{ padding: '20px', maxWidth: 'calc(100vw - 24px)' }">
      <template #reference>
        <el-button class="modelButton" text :disabled="disabled" aria-label="模型与思考强度设置">
          <modelIcon v-if="selectedModelChoice" :model="selectedModelChoice.modelId" :vendor="selectedModelChoice.vendor" :size="14" />
          <span class="modelName">{{ selectedModelChoice?.label ?? "选择模型" }}</span>
          <template v-if="reasoningLevels.length">
            ·
            <span class="reasoningLabel">{{ reasoningLabel }}</span>
          </template>
          <component :is="visible ? IconChevronUp : IconChevronDown" :size="14" aria-hidden="true" />
        </el-button>
      </template>
      <el-form class="modelOptions" labelPosition="top">
        <el-form-item label="模型">
          <el-select v-model="selectedModel" filterable :disabled="disabled" :teleported="false" placeholder="选择模型" aria-label="选择模型" noDataText="请先登录麦麦云账号" @change="reasoningEffort = ''">
            <template #prefix><modelIcon v-if="selectedModelChoice" :model="selectedModelChoice.modelId" :vendor="selectedModelChoice.vendor" :size="18" /></template>
            <el-option v-for="model in modelChoices" :key="model.value" :label="model.label" :value="model.value">
              <el-space :size="8">
                <modelIcon :model="model.modelId" :vendor="model.vendor" :size="16" />
                <span>{{ model.label }}</span>
              </el-space>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item v-if="reasoningLevels.length" label="思考强度">
          <el-select v-model="reasoningEffort" :disabled="disabled" :teleported="false" aria-label="思考强度" :aria-describedby="`${reasoningId}Hint`">
            <el-option v-for="option in reasoningOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
          <div :id="`${reasoningId}Hint`" class="reasoningHint">默认由模型决定</div>
        </el-form-item>
      </el-form>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-vue";
import { modelIcon } from "@toonflow/model-icons";
import type { ThinkingLevel } from "@toonflow/server/modelReasoning";
import { modelChoices } from "@/stores/settings";

const selectedModel = defineModel<string>({ default: "" });
const reasoningEffort = defineModel<string>("reasoningEffort", { default: "" });
const props = withDefaults(defineProps<{ active?: boolean; disabled?: boolean }>(), { active: true, disabled: false });
const visible = ref(false);
const reasoningId = useId();
const reasoningLabels: Record<ThinkingLevel, string> = { off: "Off", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "XHigh", max: "Max" };
const selectedModelChoice = computed(() => modelChoices.value.find(item => item.value === selectedModel.value));
const reasoningLevels = computed(() => selectedModelChoice.value?.reasoningLevels ?? []);
const reasoningOptions = computed(() => [{ label: "Default", value: "" }, ...reasoningLevels.value.map(value => ({ label: reasoningLabels[value], value }))]);
const reasoningLabel = computed(() => reasoningOptions.value.find(item => item.value === reasoningEffort.value)?.label ?? "Default");
// 旧对话保存的是本地供应商 ID（如 codex），按模型 ID 换成云端选项，和服务端匹配规则一致。
watch([modelChoices, selectedModel], ([items, value]) => {
  if (!value) return void (selectedModel.value = items[0]?.value ?? "");
  if (items.some(item => item.value === value)) return;
  const modelId = (() => { try { return (JSON.parse(value) as unknown[])[1]; } catch { return undefined; } })();
  const match = items.find(item => item.modelId === modelId);
  if (match) selectedModel.value = match.value;
}, { immediate: true });
watch([() => selectedModelChoice.value?.reasoningLevels, reasoningEffort], ([levels, effort]) => {
  if (levels && effort && !levels.includes(effort as ThinkingLevel)) reasoningEffort.value = "";
}, { immediate: true, flush: "post" });
watch(() => !props.active || props.disabled, close => { if (close) visible.value = false; });
</script>

<style lang="scss">
.modelPopover {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;

  .modelButton {
    max-width: 100%;
    min-width: 0;
    height: 28px;
    padding: 0 8px;
    color: var(--el-text-color-regular);

    > span {
      display: flex;
      gap: 6px;
      min-width: 0;
    }
    svg {
      flex-shrink: 0;
    }

    .reasoningLabel {
      flex-shrink: 0;
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    .modelName {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }
  }
}

.agentModelPopover {
  .modelOptions {
    .el-form-item {
      margin-bottom: 20px;

      &:last-child {
        margin-bottom: 0;
      }
      .el-form-item__label {
        margin-bottom: 8px;
        font-weight: 500;
        color: var(--el-text-color-primary);
      }
      .el-select {
        width: 100%;
      }
      .reasoningHint {
        margin-top: 8px;
        color: var(--el-text-color-secondary);
        font-size: 12px;
        line-height: 18px;
      }
    }
  }
}
</style>
