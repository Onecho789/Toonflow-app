<template>
  <el-form class="cloudDefaultForm" labelPosition="top">
    <el-form-item :label="`${title}默认模型`">
      <el-select :modelValue="selected?.modelId" filterable placeholder="选择默认模型" :aria-label="`${title}默认模型`" noDataText="暂无可用模型" @change="changeModel">
        <template #prefix><modelIcon v-if="selected" :model="selected.modelId" :vendor="selected.vendor" :size="18" /></template>
        <el-option v-for="item in models" :key="item.modelId" :label="item.label" :value="item.modelId">
          <el-space :size="8">
            <modelIcon :model="item.modelId" :vendor="item.vendor" :size="16" />
            <span>{{ item.label }}</span>
          </el-space>
        </el-option>
      </el-select>
    </el-form-item>
    <el-form-item :label="`${title}分组（线路）`">
      <el-select :modelValue="group" :disabled="!selected" placeholder="选择分组" :aria-label="`${title}分组（线路）`" @change="changeGroup">
        <el-option v-for="item in groups" :key="item.name" :label="groupText(item)" :value="item.name" />
      </el-select>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { modelIcon } from "@toonflow/model-icons";
import { cloudDefaults, groupText, modelGroups, updateCloudDefault, type CloudModelGroup } from "@/stores/settings";

const props = defineProps<{ type: "text" | "image" | "video"; title: string; models: { modelId: string; label: string; vendor?: string; groups?: CloudModelGroup[] }[] }>();
const saved = computed(() => cloudDefaults.value[props.type]);
const selected = computed(() => props.models.find(item => item.modelId === saved.value?.model));
const groups = computed(() => modelGroups(selected.value?.groups));
// 保存的分组已不在该模型的可用分组里时显示 default，与服务端发请求时的回退一致。
const group = computed(() => groups.value.some(item => item.name === saved.value?.group) ? saved.value?.group : groups.value.find(item => item.name === "default")?.name ?? groups.value[0]?.name);

// 默认模型已下架时改为第一项，分组不可用时改为 default，各提示一次；列表为空（未登录或读取失败）时不改。
watch([() => props.models, saved], ([items, value]) => {
  const first = items[0];
  if (!value || !first) return;
  if (!selected.value) {
    ElMessage.warning(`${props.title}默认模型「${value.model}」已不可用，已改为「${first.label}」`);
    return changeModel(first.modelId);
  }
  if (group.value !== value.group) {
    ElMessage.warning(`${props.title}分组「${value.group}」对该模型不可用，已改为「${groups.value.find(item => item.name === group.value)?.label ?? group.value}」`);
    save(selected.value.modelId, group.value ?? "default");
  }
}, { immediate: true });

function save(model: string, groupName: string) {
  updateCloudDefault(props.type, { model, group: groupName }).catch(() => ElMessage.error("默认模型保存失败，请稍后重试"));
}

function changeModel(modelId: string) {
  const available = modelGroups(props.models.find(item => item.modelId === modelId)?.groups);
  const keep = available.find(item => item.name === saved.value?.group) ?? available.find(item => item.name === "default") ?? available[0];
  save(modelId, keep?.name ?? "default");
}

function changeGroup(name: string) {
  if (selected.value) save(selected.value.modelId, name);
}
</script>

<style lang="scss" scoped>
.cloudDefaultForm {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0 12px;
  margin-bottom: 12px;
}
</style>
