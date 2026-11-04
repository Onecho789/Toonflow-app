<template>
  <nodeSkeleton
    v-bind="nodeProps"
    v-model:bottomVisible="node.selected"
    :topVisible="false"
    :bottomWidth="660"
    :style="{ width: '920px' }">
    <div class="storyboard">
      <div class="storyboardToolbar">
        <span class="summary">{{ shots.length }} 个镜头 · 共 {{ totalDuration }} 秒</span>
        <div class="toolbarActions">
          <el-button size="small" text :icon="IconUsers" @click="libraryVisible = true">角色库<span v-if="characters.length" class="count">{{ characters.length }}</span></el-button>
          <el-button size="small" text :icon="IconPlus" :disabled="splitting" @click="addShot">新增镜头</el-button>
        </div>
      </div>
      <el-alert v-if="libraryError" :title="libraryError" type="warning" :closable="false" showIcon />
      <div class="shotTable nodrag nopan nowheel" @dblclick.stop>
        <div v-if="splitting" class="tableLoading" role="status" aria-live="polite">
          <icon-loader2 class="loadingIcon" :size="18" aria-hidden="true" />
          <span>正在拆分镜头…</span>
          <el-button size="small" text @click="splitController?.abort()">取消</el-button>
        </div>
        <template v-else-if="shots.length">
          <div class="shotRow headerRow" aria-hidden="true">
            <span></span><span>镜号</span><span>景别</span><span>画面描述</span><span>台词 / 旁白</span><span>时长（秒）</span><span>角色</span><span></span>
          </div>
          <vue-draggable v-model="shots" class="shotList" handle=".dragHandle" :animation="150">
            <div v-for="shot in shots" :key="shot.id" class="shotRow" :class="{ fresh: freshIds.has(shot.id) }" @animationend="freshIds.delete(shot.id)">
              <button class="dragHandle" type="button" title="拖动排序" :aria-label="`拖动镜头 ${shot.number}`"><icon-grip-vertical :size="16" aria-hidden="true" /></button>
              <span class="shotNumber">{{ shot.number }}</span>
              <el-select v-model="shot.shotSize" size="small" filterable allowCreate defaultFirstOption placeholder="景别" aria-label="景别">
                <el-option v-for="item in shotSizes" :key="item" :label="item" :value="item" />
              </el-select>
              <el-input v-model="shot.description" type="textarea" size="small" :autosize="{ minRows: 2, maxRows: 6 }" maxlength="4000" placeholder="画面内容，会作为生成画面的提示词" aria-label="画面描述" />
              <el-input v-model="shot.dialogue" type="textarea" size="small" :autosize="{ minRows: 2, maxRows: 6 }" maxlength="4000" placeholder="没有可留空" aria-label="台词或旁白" />
              <el-input-number v-model="shot.duration" size="small" :min="0.5" :max="600" :step="0.5" :precision="1" controlsPosition="right" aria-label="时长（秒）" @change="value => shot.duration = clampDuration(value)" />
              <el-select v-model="shot.characterIds" size="small" multiple collapseTags collapseTagsTooltip placeholder="绑定角色" aria-label="绑定角色" noDataText="角色库为空，先添加角色">
                <el-option v-for="item in characterOptions(shot)" :key="item.id" :label="item.name" :value="item.id" :disabled="item.missing" />
              </el-select>
              <div class="rowActions">
                <el-button size="small" text type="primary" :icon="IconPhotoAi" :loading="creatingId === shot.id" :disabled="!!creatingId || !shot.description.trim()" title="生成画面" @click="createImageNode(shot)">生成画面</el-button>
                <el-button size="small" text type="danger" :icon="IconTrash" title="删除镜头" :aria-label="`删除镜头 ${shot.number}`" @click="removeShot(shot.id)" />
              </div>
            </div>
          </vue-draggable>
        </template>
        <div v-else class="tableEmpty">
          <icon-layout-list :size="36" stroke="1.25" aria-hidden="true" />
          <span>{{ script ? "剧本已就绪，选中节点后用 AI 拆分镜头" : "连接文本节点作为剧本，或手动新增第一个镜头" }}</span>
        </div>
      </div>
    </div>
    <template #bottom>
      <el-card class="promptCard" shadow="never" :bodyStyle="{ padding: '14px 16px 12px' }">
        <p class="scriptState" :class="{ ready: !!script }">
          <icon-circle-check v-if="script" :size="16" aria-hidden="true" />
          <icon-file-text v-else :size="16" aria-hidden="true" />
          {{ script ? `已读取上游剧本 ${script.length} 字，将结合角色库拆分为镜头` : "把文本节点连接到左侧输入，作为拆分镜头的剧本" }}
        </p>
        <div class="promptFooter">
          <el-select v-model="model" class="modelSelect" filterable :loading="modelsLoading" :disabled="splitting" placeholder="选择模型" aria-label="拆分模型" noDataText="请先在设置中添加模型" placement="top-start" @visible-change="visible => visible && loadModels()">
            <template #prefix><modelOption v-if="selectedModel" :model="selectedModel" iconOnly :size="17" /><icon-sparkles v-else :size="17" /></template>
            <el-option-group v-for="provider in modelGroups" :key="provider.id" :label="provider.label">
              <el-option v-for="item in provider.models" :key="item.modelId" :label="item.label" :value="JSON.stringify([item.providerId, item.modelId])"><modelOption :model="item" /></el-option>
            </el-option-group>
          </el-select>
          <el-button type="primary" :icon="IconWand" :loading="splitting" :disabled="!script || !selectedModel || splitting" @click="split">AI 拆分镜头</el-button>
        </div>
      </el-card>
    </template>
  </nodeSkeleton>
  <characterDialog v-model="libraryVisible" @saved="loadLibrary" />
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onScopeDispose, reactive, ref, watch } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { ElAlert, ElButton, ElCard, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElOption, ElOptionGroup, ElSelect } from "element-plus";
import { IconCircleCheck, IconFileText, IconGripVertical, IconLayoutList, IconLoader2, IconPhotoAi, IconPlus, IconSparkles, IconTrash, IconUsers, IconWand } from "@tabler/icons-vue";
import { VueDraggable } from "vue-draggable-plus";
import { nodeSkeleton, nodeTools, useNode, z, type NodeAiModel, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import { pickModel } from "@toonflow/node-shared/pickModel";
import modelOption from "@toonflow/node-shared/modelOption";
import { errorMessage, imageMimeType, loadCharacterLibrary, type Character } from "./characterLibrary";
import { clampDuration, createShot, shotSizes, shotsText, splitScript, type Shot } from "./shots";
import characterDialog from "./components/characterDialog.vue";

defineOptions({
  inheritAttrs: false,
  icon: IconLayoutList,
  handles: [
    { id: "in", type: "target", dataType: "STRING", label: "剧本输入" },
    { id: "text", type: "source", dataType: "STRING", label: "分镜文本输出" },
  ] satisfies NodeHandle[],
});
const { id, node, nodeProps, outputs, nodeEvent, ai, files } = useNode({
  label: "分镜表",
  outputs: { text: { dataType: "STRING", value: "" } },
});
const { addNodes, addEdges, removeNodes, findNode, getNodes, nodeTypes } = useVueFlow();
const batchHistory = inject<(action: () => Promise<void>) => Promise<void>>("batchCanvasHistory", action => action());

type StoryboardData = typeof node.data & { shots?: Shot[]; model?: string };
const data = computed(() => node.data as StoryboardData);
data.value.shots ??= [];
const shots = computed({ get: () => data.value.shots ?? [], set: (value: Shot[]) => { data.value.shots = value; } });
const model = computed({ get: () => data.value.model ?? "", set: (value: string) => { data.value.model = value; } });
const models = ref<NodeAiModel[]>([]);
const modelsLoading = ref(false);
const selectedModel = computed(() => models.value.find(item => JSON.stringify([item.providerId, item.modelId]) === model.value));
const modelGroups = computed(() => groupNodeModels(models.value));
const script = ref("");
const splitting = ref(false);
const creatingId = ref("");
const libraryVisible = ref(false);
const libraryError = ref("");
const library = ref<Awaited<ReturnType<typeof loadCharacterLibrary>>>();
const characters = computed<Character[]>(() => library.value?.characters ?? []);
const freshIds = reactive(new Set<string>());
const totalDuration = computed(() => Math.round(shots.value.reduce((sum, shot) => sum + shot.duration, 0) * 10) / 10);
let splitController: AbortController | undefined;

nodeEvent.on("input:in", values => {
  script.value = values.flatMap(item => item.dataType === "STRING" && typeof item.value === "string" && item.value.trim() ? [item.value.trim()] : []).join("\n\n");
});
nodeEvent.on("save", () => {
  if (splitting.value || creatingId.value) throw new Error("分镜表处理中，请完成后再切换或刷新节点");
});
// 镜号始终等于行序号，文本输出随镜头和角色名称同步。
watch([shots, characters], () => {
  shots.value.forEach((shot, index) => { if (shot.number !== index + 1) shot.number = index + 1; });
  const text = shotsText(shots.value, characters.value);
  if (outputs.value.text.value !== text) outputs.value.text.value = text;
}, { deep: true, immediate: true });
onMounted(() => {
  void loadModels();
  void loadLibrary();
});
onScopeDispose(() => splitController?.abort());

nodeTools.register({
  name: "setShots",
  description: "替换此分镜表的全部镜头；characterIds 使用角色库中的角色 id，duration 单位为秒",
  parameters: z.strictObject({
    shots: z.array(z.strictObject({
      shotSize: z.string().max(20),
      description: z.string().max(4000),
      dialogue: z.string().max(4000),
      duration: z.number().min(0.5).max(600),
      characterIds: z.array(z.string().max(100)).max(50),
    })).max(300),
  }),
  async execute(input) {
    if (splitting.value) throw new Error("镜头拆分中，请稍后修改");
    shots.value = input.shots.map(item => createShot({ ...item, duration: clampDuration(item.duration) }));
    await nextTick();
    return { shots: shots.value };
  },
});

async function loadModels() {
  if (modelsLoading.value) return;
  modelsLoading.value = true;
  try {
    models.value = await ai.getModels();
    const next = pickModel(models.value, model.value);
    if (next !== model.value) model.value = next;
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError") ElMessage.error(error.message);
  } finally {
    modelsLoading.value = false;
  }
}

async function loadLibrary() {
  try {
    library.value = await loadCharacterLibrary(files.getWorkspaceFiles());
    libraryError.value = "";
  } catch (error) {
    libraryError.value = errorMessage(error, "角色库读取失败");
  }
}

function characterOptions(shot: Shot) {
  const known = new Set(characters.value.map(item => item.id));
  return [
    ...characters.value.map(item => ({ id: item.id, name: item.name, missing: false })),
    ...shot.characterIds.filter(item => !known.has(item)).map(item => ({ id: item, name: "已删除角色", missing: true })),
  ];
}

function addShot() {
  const shot = createShot();
  freshIds.add(shot.id);
  shots.value.push(shot);
}

function removeShot(shotId: string) {
  shots.value = shots.value.filter(item => item.id !== shotId);
}

async function split() {
  const choice = selectedModel.value;
  if (splitting.value || !choice || !script.value) return;
  if (shots.value.length) {
    const confirmed = await ElMessageBox.confirm("AI 拆分的镜头会替换当前全部镜头，已绑定的角色和修改不会保留。", "重新拆分镜头", {
      confirmButtonText: "替换", cancelButtonText: "取消", type: "warning",
    }).then(() => true, () => false);
    if (!confirmed) return;
  }
  splitting.value = true;
  splitController = new AbortController();
  try {
    await loadLibrary();
    const next = await splitScript({ ai, model: choice, script: script.value, characters: characters.value, signal: splitController.signal });
    next.forEach(shot => freshIds.add(shot.id));
    shots.value = next;
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) ElMessage.error(errorMessage(error, "镜头拆分失败"));
  } finally {
    splitting.value = false;
    splitController = undefined;
  }
}

// 在 x 列从 y 开始向下找一个不与已有节点重叠的位置。
function freeY(x: number, y: number, width: number, height: number) {
  for (const other of [...getNodes.value].sort((left, right) => left.computedPosition.y - right.computedPosition.y)) {
    const position = other.computedPosition;
    if (position.x < x + width && position.x + (other.dimensions.width || 320) > x && position.y < y + height && position.y + (other.dimensions.height || 300) > y) {
      y = position.y + (other.dimensions.height || 300) + 40;
    }
  }
  return y;
}

async function createImageNode(shot: Shot) {
  const generationType = "remote-imageGenerationNode";
  const imageType = "remote-imageNode";
  if (creatingId.value || !shot.description.trim()) return;
  try {
    if (!nodeTypes?.value?.[generationType]) throw new Error("请先启用图片生成节点插件");
    if (shot.imageNodeId && findNode(shot.imageNodeId)) {
      const confirmed = await ElMessageBox.confirm(`镜头 ${shot.number} 已有画面节点，是否再新建一个？`, "生成画面", {
        confirmButtonText: "新建", cancelButtonText: "取消", type: "info",
      }).then(() => true, () => false);
      if (!confirmed) return;
    }
    creatingId.value = shot.id;
    await loadLibrary();
    const bound = shot.characterIds.flatMap(item => characters.value.find(character => character.id === item) ?? []);
    const references = bound.flatMap(character => character.images.map(path => ({ character, path })));
    if (references.length && !nodeTypes.value[imageType]) throw new Error("请先启用图片节点插件，用于传入角色设定图");
    // ACT: 设定图作为上游图片节点传给图片生成节点；同一分镜表内按角色与图片路径复用已建的图片节点。
    const existing = new Map(getNodes.value.flatMap(item => {
      const source = (item.data as { storyboardReference?: { storyboardId: string; path: string } }).storyboardReference;
      return item.type === imageType && source?.storyboardId === id ? [[source.path, item.id] as const] : [];
    }));
    const referenceX = node.computedPosition.x + (node.dimensions.width || 920) + 80;
    const generationX = referenceX + (references.length ? 360 : 0);
    const generationY = freeY(generationX, node.computedPosition.y, 340, 360);
    const nodeId = crypto.randomUUID();
    const prompt = shot.description.trim();
    const created: string[] = [];
    await batchHistory(async () => {
      try {
        addNodes({
          id: nodeId,
          type: generationType,
          position: { x: generationX, y: generationY },
          data: { label: `${node.data.label || "分镜表"} · 镜头 ${shot.number}`, ratio: "16:9", prompt, promptModel: prompt.split("\n").map(text => [{ type: "Write", text }]) },
        });
        created.push(nodeId);
        let referenceY = generationY;
        for (const { character, path } of references) {
          let sourceId = existing.get(path);
          if (!sourceId) {
            sourceId = crypto.randomUUID();
            referenceY = freeY(referenceX, referenceY, 320, 300);
            addNodes({
              id: sourceId,
              type: imageType,
              position: { x: referenceX, y: referenceY },
              data: {
                label: `角色 · ${character.name}`,
                storyboardReference: { storyboardId: id, characterId: character.id, path },
                outputs: { image: { dataType: "IMAGE", value: { url: path, mimeType: imageMimeType(path) } } },
              },
            });
            created.push(sourceId);
            existing.set(path, sourceId);
            referenceY += 340;
          }
          addEdges({ id: crypto.randomUUID(), source: sourceId, sourceHandle: "image", target: nodeId, targetHandle: "in" });
        }
      } catch (error) {
        removeNodes(created, true, false);
        throw error;
      }
      await nextTick();
    });
    shot.imageNodeId = nodeId;
  } catch (error) {
    ElMessage.error(errorMessage(error, "画面节点创建失败"));
  } finally {
    creatingId.value = "";
  }
}
</script>

<style lang="scss" scoped>
.storyboard {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .storyboardToolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    .summary {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    .toolbarActions {
      display: flex;
      align-items: center;
      gap: 4px;

      .count {
        margin-left: 4px;
        padding: 0 6px;
        border-radius: var(--ui-radius-small);
        background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
        color: var(--el-color-primary);
        font-size: 11px;
        line-height: 16px;
      }
    }
  }

  .shotTable {
    max-height: 520px;
    overflow: auto;
    cursor: default;

    .shotRow {
      display: grid;
      grid-template-columns: 24px 32px 92px minmax(0, 1.4fr) minmax(0, 1fr) 84px 140px 116px;
      align-items: start;
      gap: 8px;
      padding: 8px 4px;
      border-bottom: 1px solid var(--el-border-color-lighter);
      border-radius: var(--ui-radius-small);
      transition: background-color 120ms ease-out;

      &:not(.headerRow):hover { background: var(--el-fill-color-lighter); }

      &.fresh { animation: shotFadeIn 160ms ease-out; }

      &.headerRow {
        position: sticky;
        top: 0;
        z-index: 1;
        padding-top: 4px;
        padding-bottom: 4px;
        background: var(--el-bg-color);
        color: var(--el-text-color-secondary);
        font-size: 12px;
      }

      .dragHandle {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: var(--ui-radius-small);
        background: transparent;
        color: var(--el-text-color-placeholder);
        cursor: grab;

        &:hover, &:focus-visible { color: var(--el-color-primary); }
      }

      .shotNumber {
        line-height: 24px;
        color: var(--el-text-color-primary);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        text-align: center;
      }

      :deep(.el-input-number) { width: 100%; }

      .rowActions {
        display: flex;
        align-items: center;
        gap: 0;

        .el-button { margin: 0; padding: 4px 6px; }

        .el-button--primary:not(.is-disabled) {
          transition: transform 120ms ease-out;

          &:hover { transform: translateY(-1px); }
        }
      }
    }

    .tableLoading, .tableEmpty {
      display: flex;
      min-height: 160px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    .tableLoading .loadingIcon {
      color: var(--el-color-primary);
      animation: nodeLoading 1s linear infinite;
    }

    .tableEmpty {
      flex-direction: column;
      font-size: 13px;

      svg { color: var(--el-color-primary); }
    }
  }
}

.promptCard {
  border-radius: var(--ui-radius-large);

  .scriptState {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 12px;
    color: var(--el-text-color-secondary);
    font-size: 13px;

    &.ready svg { color: var(--el-color-success); }
  }

  .promptFooter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    .modelSelect {
      width: 190px;

      :deep(.el-select__wrapper) {
        box-shadow: none;
        background: transparent;
      }
    }
  }
}

@keyframes shotFadeIn {
  from { opacity: 0; transform: translateY(4px); }
}

@keyframes nodeLoading {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .storyboard .shotTable .shotRow,
  .storyboard .shotTable .shotRow .rowActions .el-button--primary:not(.is-disabled) { transition: none; }
  .storyboard .shotTable .shotRow.fresh,
  .storyboard .shotTable .tableLoading .loadingIcon { animation: none; }
  .storyboard .shotTable .shotRow .rowActions .el-button--primary:not(.is-disabled):hover { transform: none; }
}
</style>
