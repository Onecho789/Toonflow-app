<template>
  <el-popover
    v-model:visible="visible"
    virtualTriggering
    :virtualRef="trigger"
    placement="bottom-start"
    :width="300"
    :persistent="false"
    :showArrow="false"
    :popperStyle="{ maxWidth: 'calc(100vw - 24px)', padding: '16px', borderRadius: '12px' }">
    <div class="imageInfo nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop @keydown.esc.prevent="visible = false; trigger?.focus()">
      <strong class="infoTitle">图片信息</strong>
      <dl class="infoList">
        <template v-for="item in rows" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd :title="item.value">{{ item.value }}</dd>
        </template>
      </dl>
      <template v-if="prompt?.trim()">
        <div class="promptHead">
          <span>提示词</span>
          <el-button link size="small" @click="copyPrompt">复制</el-button>
        </div>
        <p class="promptText">{{ prompt }}</p>
      </template>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { ElButton, ElMessage, ElPopover } from "element-plus";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/runtime";
import { loadImage } from "../useDerivedImageNode";

const props = defineProps<{ src: string; source?: NodeMediaValue; prompt?: string; active: boolean }>();
const { getSelectedNodes, onNodeDragStart, onMoveStart } = useVueFlow();
const visible = ref(false);
const trigger = ref<HTMLElement>();
const natural = ref({ width: 0, height: 0 });
const fileSize = ref<number>();

const rows = computed(() => {
  const { width, height } = natural.value;
  const name = props.source?.url.split(/[\\/]/).at(-1) ?? "";
  return [
    { label: "文件", value: name || "—" },
    { label: "尺寸", value: width ? `${width} × ${height} px` : "读取中…" },
    { label: "比例", value: width ? simplifyRatio(width, height) : "—" },
    { label: "大小", value: fileSize.value ? formatSize(fileSize.value) : "—" },
    { label: "格式", value: props.source?.mimeType || "—" },
  ];
});

watch(() => props.active, active => { if (!active) visible.value = false; });
watch(() => getSelectedNodes.value.length, count => { if (count !== 1) visible.value = false; });
onNodeDragStart(() => { visible.value = false; });
onMoveStart(() => { visible.value = false; });
watch([visible, () => props.src], async ([open, src]) => {
  if (!open || !src) return;
  natural.value = { width: 0, height: 0 };
  fileSize.value = undefined;
  try {
    const [image, blob] = await Promise.all([loadImage(src), fetch(src).then(response => response.blob())]);
    if (props.src !== src) return;
    natural.value = { width: image.naturalWidth, height: image.naturalHeight };
    fileSize.value = blob.size;
  } catch { /* 信息只是附加展示 */ }
});

function open(anchor: MouseEvent | HTMLElement) {
  if (!props.src) return;
  trigger.value = anchor instanceof HTMLElement ? anchor : anchor.currentTarget as HTMLElement;
  visible.value = !visible.value;
}

defineExpose({ open });

function simplifyRatio(width: number, height: number) {
  const gcd = (left: number, right: number): number => right ? gcd(right, left % right) : left;
  const divisor = gcd(width, height);
  const [w, h] = [width / divisor, height / divisor];
  return w <= 50 && h <= 50 ? `${w}:${h}` : `${(width / height).toFixed(2)}:1`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(props.prompt ?? "");
    ElMessage.success("提示词已复制");
  } catch { ElMessage.error("复制失败"); }
}
</script>

<style scoped lang="scss">
.imageInfo {
  color: var(--el-text-color-primary);

  .infoTitle { display: block; margin-bottom: 12px; font-size: 14px; }

  .infoList {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 8px 16px;
    margin: 0;
    font-size: 13px;

    dt { color: var(--el-text-color-secondary); }
    dd {
      margin: 0;
      overflow: hidden;
      font-variant-numeric: tabular-nums;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .promptHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 14px 0 6px;
    padding-top: 12px;
    border-top: 1px solid var(--el-border-color-lighter);
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  .promptText {
    max-height: 120px;
    margin: 0;
    overflow-y: auto;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
}
</style>
