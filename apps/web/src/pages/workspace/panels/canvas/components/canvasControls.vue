<template>
  <mini-map
    v-if="showMap"
    class="canvasMiniMap"
    position="bottom-left"
    :pannable="true"
    :zoomable="true"
    nodeColor="var(--el-fill-color-dark)"
    maskColor="var(--el-mask-color-extra-light)" />
  <panel class="canvasControlsPanel nodrag nopan nowheel" position="bottom-left" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
    <el-card class="canvasControlsCard" shadow="never" :bodyStyle="{ padding: '4px' }">
      <div class="canvasControls" role="group" aria-label="画布视图">
        <el-tooltip :content="showMap ? '隐藏小地图' : '显示小地图'" placement="top" :showArrow="false" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <el-button class="toolButton" text :type="showMap ? 'primary' : 'default'" :aria-pressed="showMap" aria-label="小地图" @click="showMap = !showMap"><icon-map :size="18" aria-hidden="true" /></el-button>
        </el-tooltip>
        <el-tooltip :content="actionHint('适应视图', 'fitView')" placement="top" :showArrow="false" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <el-button class="toolButton" text aria-label="适应视图" @click="fitView()"><icon-focus-centered :size="18" aria-hidden="true" /></el-button>
        </el-tooltip>
        <input class="zoomSlider" type="range" :min="minZoom * 100" :max="maxZoom * 100" :step="1" :value="zoomPercent" aria-label="画布缩放比例" :aria-valuetext="`${zoomPercent}%`" @input="applyZoom(Number(($event.target as HTMLInputElement).value))" />
        <el-tooltip content="缩放比例（点击输入，滚轮调整）" placement="top" :showArrow="false" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]" :disabled="zoomMenuVisible">
          <span class="toolTrigger">
            <el-popover v-model:visible="zoomMenuVisible" trigger="click" placement="top-start" :width="216">
              <template #reference>
                <el-button class="toolButton zoomPercent" text aria-label="缩放菜单" aria-haspopup="dialog" :aria-expanded="zoomMenuVisible"
                  @wheel.stop.prevent="$event.deltaY && applyZoom(zoomPercent - Math.sign($event.deltaY))">{{ zoomPercent }}%</el-button>
              </template>
              <div class="zoomMenu">
                <el-input-number class="zoomInput" :modelValue="zoomPercent" :min="minZoom * 100" :max="maxZoom * 100" :controls="false" aria-label="缩放百分比" @change="applyZoom">
                  <template #suffix>%</template>
                </el-input-number>
                <el-button class="zoomAction" text @click="applyZoom(100); zoomMenuVisible = false">重置为 100%</el-button>
              </div>
            </el-popover>
          </span>
        </el-tooltip>
      </div>
    </el-card>
  </panel>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Panel, useVueFlow } from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import { IconMap, IconFocusCentered } from "@tabler/icons-vue";
import { ElMessage } from "element-plus";
import { arrangeCanvas } from "../arrangeCanvas";
import { generalSettings } from "@/stores/settings";
import { shortcutLabel, type CanvasShortcutAction } from "@/lib/canvasShortcuts";

const props = defineProps<{
  canvasId: string;
  directory: string | undefined;
  batchHistory: (action: () => Promise<void>) => Promise<void>;
}>();
const showMap = ref(false);
const zoomMenuVisible = ref(false);
const flow = useVueFlow();
const { viewport, minZoom, maxZoom, zoomTo, fitView, getNodes } = flow;
const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100));
const arranging = ref(false);
let arrangeController: AbortController | undefined;
const canArrange = computed(() => {
  const nodes = getNodes.value.filter((node) => !node.parentNode);
  return !!props.canvasId && !!props.directory && !arranging.value && nodes.length > 0
    && nodes.every((node) => node.dimensions.width > 0 && node.dimensions.height > 0);
});
defineExpose({ arrangeNodes, canArrange, arranging });

watch(() => [props.canvasId, props.directory], () => arrangeController?.abort(), { flush: "sync" });
onBeforeUnmount(() => arrangeController?.abort());

function actionHint(label: string, action: CanvasShortcutAction) {
  const keys = shortcutLabel(generalSettings.value.canvasShortcuts[action]);
  return keys ? `${label}（${keys}）` : label;
}

function applyZoom(value: number | undefined) {
  if (value !== undefined && Number.isFinite(value)) void zoomTo(Math.min(maxZoom.value, Math.max(minZoom.value, value / 100)));
}

async function arrangeNodes() {
  if (!canArrange.value) return;
  const controller = new AbortController();
  arrangeController = controller;
  arranging.value = true;
  try {
    // 整理作为一个历史步骤，使用主工具栏的撤销恢复。
    await props.batchHistory(async () => {
      await arrangeCanvas(flow, controller.signal);
      controller.signal.throwIfAborted();
    });
  } catch (error) {
    if (!controller.signal.aborted) ElMessage.error(error instanceof Error ? error.message : "整理画布失败");
  } finally {
    arrangeController = undefined;
    arranging.value = false;
  }
}
</script>

<style lang="scss" scoped>
.canvasMiniMap.vue-flow__minimap { bottom: 62px; }

.canvasControlsPanel.vue-flow__panel { max-width: calc(100% - 30px); }

@container canvasWorkspace (max-width: 1200px) {
  .canvasControlsPanel.vue-flow__panel { bottom: 78px; }
  .canvasMiniMap.vue-flow__minimap { bottom: 132px; }
}

.canvasControlsCard { box-sizing: border-box; border-radius: 12px; }

.canvasControls {
  display: flex;
  align-items: center;
  gap: 4px;

  .toolTrigger { display: inline-flex; flex-shrink: 0; }

  .zoomSlider {
    width: 120px;
    min-width: 40px;
    height: 36px;
    margin: 0 4px;
    accent-color: var(--el-color-primary);
    cursor: pointer;

    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
  }

  .toolButton {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    margin-left: 0;
    padding: 0;
    border-radius: 8px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;

    &.zoomPercent { width: 58px; }
    &[aria-pressed="true"] { background: var(--el-color-primary-light-9); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
  }
}

.zoomMenu {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .zoomInput { width: 100%; }
  .zoomAction { min-height: 36px; justify-content: flex-start; margin-left: 0; }
}
</style>
