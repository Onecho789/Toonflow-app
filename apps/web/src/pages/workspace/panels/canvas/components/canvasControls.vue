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
      <div class="canvasControls" role="group" aria-label="画布视图与历史">
        <el-tooltip :content="actionHint('撤销', 'undo')" placement="top" :showArrow="false" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <span class="toolTrigger">
            <el-button class="toolButton" text :disabled="!canUndo" aria-label="撤销" @click="emit('undo')"><icon-arrow-back-up :size="18" /></el-button>
          </span>
        </el-tooltip>
        <el-tooltip :content="actionHint('重做', 'redo')" placement="top" :showArrow="false" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <span class="toolTrigger">
            <el-button class="toolButton" text :disabled="!canRedo" aria-label="重做" @click="emit('redo')"><icon-arrow-forward-up :size="18" /></el-button>
          </span>
        </el-tooltip>
        <span class="toolDivider" aria-hidden="true" />
        <el-tooltip :showArrow="false" :content="assetsVisible ? '关闭素材库' : '打开素材库'" placement="top" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <el-button class="toolButton" text :type="assetsVisible ? 'primary' : 'default'" :aria-pressed="assetsVisible" aria-label="素材库" @click="assetsVisible = !assetsVisible">
            <icon-folders :size="18" />
          </el-button>
        </el-tooltip>
        <!-- 整理成功后显示撤销入口，点击外部仍可关闭。 -->
        <el-tooltip :showArrow="false" :content="actionHint(arranging ? '正在整理画布…' : '整理画布', 'arrange')" placement="top" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]" :disabled="undoPopoverVisible">
          <span class="toolTrigger">
            <el-popover trigger="contextmenu" placement="top-start" :width="180" v-model:visible="undoPopoverVisible">
              <template #reference>
                <el-button class="toolButton" text :disabled="!canArrange" :loading="arranging" aria-label="整理画布" @click="arrangeNodes"><icon-sitemap v-if="!arranging" :size="18" /></el-button>
              </template>
              <div class="zoomMenu"><el-button class="zoomAction" text @click="undoArrange">撤销整理</el-button></div>
            </el-popover>
          </span>
        </el-tooltip>
        <el-tooltip :showArrow="false" :content="showMap ? '隐藏地图' : '显示地图'" placement="top" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <el-button class="toolButton" text :type="showMap ? 'primary' : 'default'" :aria-pressed="showMap" aria-label="显示或隐藏地图" @click="showMap = !showMap"><icon-map :size="18" /></el-button>
        </el-tooltip>
        <el-tooltip :showArrow="false" :content="snapEnabled ? '关闭网格吸附' : '开启网格吸附'" placement="top" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <el-button class="toolButton" text :type="snapEnabled ? 'primary' : 'default'" :aria-pressed="snapEnabled" aria-label="网格吸附" @click="snapEnabled = !snapEnabled"><icon-magnet :size="18" /></el-button>
        </el-tooltip>
        <el-tooltip :showArrow="false" :content="showEdges ? '隐藏连线' : '显示连线'" placement="top" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <el-button class="toolButton" text :type="showEdges ? 'primary' : 'default'" :aria-pressed="showEdges" aria-label="显示或隐藏连线" @click="showEdges = !showEdges"><icon-arrow-guide :size="18" /></el-button>
        </el-tooltip>
        <span class="toolDivider" aria-hidden="true" />
        <el-tooltip :content="actionHint('缩小', 'zoomOut')" placement="top" :showArrow="false" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <span class="toolTrigger"><el-button class="toolButton" text :disabled="viewport.zoom <= minZoom" aria-label="缩小" @click="zoomOut()"><icon-minus :size="18" /></el-button></span>
        </el-tooltip>
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
                <el-button class="zoomAction" text @click="fitView(); zoomMenuVisible = false">适合屏幕</el-button>
              </div>
            </el-popover>
          </span>
        </el-tooltip>
        <el-tooltip :content="actionHint('放大', 'zoomIn')" placement="top" :showArrow="false" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <span class="toolTrigger"><el-button class="toolButton" text :disabled="viewport.zoom >= maxZoom" aria-label="放大" @click="zoomIn()"><icon-plus :size="18" /></el-button></span>
        </el-tooltip>
        <el-tooltip :showArrow="false" :content="actionHint('适应视图', 'fitView')" placement="top" :showAfter="200" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <el-button class="toolButton" text aria-label="适应视图" @click="fitView()"><icon-focus-centered :size="18" /></el-button>
        </el-tooltip>
      </div>
    </el-card>
  </panel>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Panel, useVueFlow, type XYPosition } from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import { IconMap, IconMagnet, IconFocusCentered, IconPlus, IconMinus, IconArrowBackUp, IconArrowForwardUp, IconFolders, IconSitemap, IconArrowGuide } from "@tabler/icons-vue";
import { ElMessage } from "element-plus";
import { arrangeCanvas } from "../arrangeCanvas";
import { generalSettings } from "@/stores/settings";
import { shortcutLabel, type CanvasShortcutAction } from "@/lib/canvasShortcuts";

const props = defineProps<{
  canvasId: string;
  canUndo: boolean;
  canRedo: boolean;
  directory: string | undefined;
  batchHistory: (action: () => Promise<void>) => Promise<void>;
}>();
const emit = defineEmits<{ undo: []; redo: [] }>();
const snapEnabled = defineModel<boolean>("snapEnabled", { required: true });
const showEdges = defineModel<boolean>("showEdges", { required: true });
const assetsVisible = defineModel<boolean>("assetsVisible", { default: false });
const showMap = ref(false);
const zoomMenuVisible = ref(false);
const flow = useVueFlow();
const { viewport, minZoom, maxZoom, zoomTo, zoomIn, zoomOut, fitView, getNodes, updateNode } = flow;
const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100));
const layoutSnapshot = ref<{ id: string; position: XYPosition }[]>();
const undoPopoverVisible = ref(false);
const arranging = ref(false);
let arrangeController: AbortController | undefined;
const canArrange = computed(() => {
  const nodes = getNodes.value.filter((node) => !node.parentNode);
  return (
    !!props.canvasId &&
    !!props.directory &&
    !arranging.value &&
    nodes.length > 0 &&
    nodes.every((node) => node.dimensions.width > 0 && node.dimensions.height > 0)
  );
});
defineExpose({ arrangeNodes });

watch(
  () => [props.canvasId, props.directory],
  () => {
    arrangeController?.abort();
    layoutSnapshot.value = undefined;
    undoPopoverVisible.value = false;
  },
  { flush: "sync" }
);
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
    await props.batchHistory(async () => {
      const { snapshot, arrangedNodeIds } = await arrangeCanvas(flow, controller.signal);
      controller.signal.throwIfAborted();
      if (!arrangedNodeIds.length) return;
      layoutSnapshot.value = snapshot;
      undoPopoverVisible.value = true;
    });
  } catch (error) {
    if (!controller.signal.aborted) ElMessage.error(error instanceof Error ? error.message : "整理画布失败");
  } finally {
    arrangeController = undefined;
    arranging.value = false;
  }
}

async function undoArrange() {
  const snapshot = layoutSnapshot.value;
  if (!snapshot) return;
  try {
    await props.batchHistory(async () => {
      const nodeIds = new Set(getNodes.value.map((node) => node.id));
      snapshot.forEach(({ id, position }) => {
        if (nodeIds.has(id)) updateNode(id, { position });
      });
      layoutSnapshot.value = undefined;
      undoPopoverVisible.value = false;
    });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "撤销整理失败");
  }
}
</script>

<style lang="scss" scoped>
.canvasMiniMap.vue-flow__minimap { bottom: 62px; }

.canvasControlsPanel.vue-flow__panel {
  max-width: calc(100% - 30px);
}

@container canvasWorkspace (max-width: 1440px) {
  .canvasControlsPanel.vue-flow__panel { bottom: 68px; }
  .canvasMiniMap.vue-flow__minimap { bottom: 120px; }
}

.canvasControlsCard {
  box-sizing: border-box;
  border-radius: 12px;
}

.canvasControls {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;

  .toolTrigger { display: inline-flex; flex-shrink: 0; }

  .toolDivider {
    height: 20px;
    margin: 0 2px;
    border-left: 1px solid var(--el-border-color-lighter);
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

    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: -2px;
    }
  }
}

.zoomMenu {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .zoomInput { width: 100%; }

  .zoomAction {
    min-height: 36px;
    justify-content: flex-start;
    margin-left: 0;
  }
}
</style>
