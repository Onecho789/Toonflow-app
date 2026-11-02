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
          <el-select v-model="reasoningEffort" :disabled="disabled" :teleported="false" aria-label="思考强度">
            <el-option v-for="option in reasoningOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-vue";
import { modelIcon } from "@toonflow/model-icons";
import type { ThinkingLevel } from "@toonflow/server/modelReasoning";
import { pickModel } from "@toonflow/node-shared/pickModel";
import { modelChoices } from "@/stores/settings";

const selectedModel = defineModel<string>({ default: "" });
const reasoningEffort = defineModel<string>("reasoningEffort", { default: "" });
const props = withDefaults(defineProps<{ active?: boolean; disabled?: boolean }>(), { active: true, disabled: false });
const visible = ref(false);
const reasoningLabels: Record<ThinkingLevel, string> = { off: "Off", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "XHigh", max: "Max" };
const selectedModelChoice = computed(() => modelChoices.value.find(item => item.value === selectedModel.value));
const reasoningLevels = computed(() => selectedModelChoice.value?.reasoningLevels ?? []);
const reasoningOptions = computed(() => reasoningLevels.value.map(value => ({ label: reasoningLabels[value], value })));
const reasoningLabel = computed(() => reasoningOptions.value.find(item => item.value === reasoningEffort.value)?.label ?? "");
// 没有已保存选择时取设置里的默认模型；旧对话的本地供应商 ID（如 codex）按模型 ID 换成云端选项；已下架时回退第一项并提示。
watch([modelChoices, selectedModel], ([items, value]) => {
  const next = pickModel(items, value);
  if (next !== value) selectedModel.value = next;
}, { immediate: true });
// 支持思考的模型总要选中一个档位：没选或不在可选范围时优先 medium，没有 medium 取第一个非 off 档；不支持思考时清空。
watch([() => selectedModelChoice.value?.reasoningLevels, reasoningEffort], ([levels, effort]) => {
  if (!levels || levels.includes(effort as ThinkingLevel)) return;
  const next = levels.includes("medium") ? "medium" : levels.find(level => level !== "off") ?? levels[0] ?? "";
  if (next !== effort) reasoningEffort.value = next;
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
    }
  }
}
</style>
