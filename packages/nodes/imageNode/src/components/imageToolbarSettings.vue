<template>
  <el-dialog v-model="visible" title="自定义工具栏" width="min(560px, calc(100vw - 32px))" alignCenter appendToBody>
    <div class="toolbarSettings nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
      <section class="settingsSection">
        <div class="sectionHead"><strong>节点预览</strong><span>未勾选的工具收进“更多”菜单</span></div>
        <div class="toolbarPreview" aria-label="工具栏预览">
          <span v-for="tool in shownTools" :key="tool.id" class="previewTool">
            <component :is="tool.icon" :size="15" aria-hidden="true" />
            <span v-if="draft.showLabels">{{ tool.label }}</span>
          </span>
          <span class="previewTool">
            <icon-dots :size="15" aria-hidden="true" />
            <span v-if="draft.showLabels">更多</span>
          </span>
        </div>
      </section>
      <section class="settingsSection">
        <div class="sectionHead"><strong>快捷工具</strong><span>{{ shownTools.length }}/{{ availableTools.length }}</span></div>
        <div class="toolList" role="group" aria-label="快捷工具">
          <el-checkbox v-for="tool in availableTools" :key="tool.id" :modelValue="!draft.hidden.includes(tool.id)" class="toolOption" border @change="toggle(tool.id, $event)">
            <span class="toolLabel"><component :is="tool.icon" :size="15" aria-hidden="true" />{{ tool.label }}</span>
          </el-checkbox>
        </div>
      </section>
      <label class="labelSwitch">
        <span>显示按钮文字</span>
        <el-switch v-model="draft.showLabels" aria-label="显示按钮文字" />
      </label>
    </div>
    <template #footer>
      <el-button class="resetButton" link @click="draft = defaultImageToolbar()">恢复默认</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElCheckbox, ElDialog, ElMessage, ElSwitch } from "element-plus";
import { IconDots } from "@tabler/icons-vue";
import { defaultImageToolbar, imageTools, saveImageToolbar, useImageToolbar, type ImageToolId, type ImageToolbarSettings } from "../imageToolbar";

const props = defineProps<{ tools: ImageToolId[] }>();
const { settings } = useImageToolbar();
const visible = ref(false);
const draft = ref<ImageToolbarSettings>(defaultImageToolbar());
const availableTools = computed(() => imageTools.filter(tool => props.tools.includes(tool.id)));
const shownTools = computed(() => availableTools.value.filter(tool => !draft.value.hidden.includes(tool.id)));

function open() {
  draft.value = { hidden: [...settings.value.hidden], showLabels: settings.value.showLabels };
  visible.value = true;
}

defineExpose({ open });

function toggle(id: ImageToolId, checked: unknown) {
  const hidden = draft.value.hidden.filter(item => item !== id);
  draft.value.hidden = checked ? hidden : [...hidden, id];
}

function save() {
  try {
    saveImageToolbar(draft.value);
    visible.value = false;
  } catch {
    ElMessage.error("工具栏设置保存失败");
  }
}
</script>

<style scoped lang="scss">
.toolbarSettings {
  display: flex;
  flex-direction: column;
  gap: 18px;

  .settingsSection {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sectionHead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;

    strong {
      color: var(--el-text-color-primary);
      font-size: 13px;
    }

    span {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
  }

  .toolbarPreview {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 12px;
    background: var(--el-bg-color);
  }

  .previewTool {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 8px;
    border-radius: 8px;
    color: var(--el-text-color-regular);
    font-size: 12px;
  }

  .toolList {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .toolOption {
    width: 100%;
    margin: 0;
    border-radius: 10px;
  }

  .toolLabel {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .labelSwitch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-radius: 12px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-regular);
    font-size: 13px;
    cursor: pointer;
  }
}

.resetButton { float: left; margin-top: 8px; }

@media (max-width: 520px) {
  .toolbarSettings .toolList { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
