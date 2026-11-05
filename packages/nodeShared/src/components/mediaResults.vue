<template>
  <div ref="root" class="mediaResults" role="list" :aria-label="mediaType === 'image' ? '其他生成图片' : '其他生成视频'" @keydown.esc.stop="emit('close')">
    <div
      v-for="card in cards"
      :key="card.item.url"
      class="resultCard nodrag nopan"
      role="listitem"
      :style="card.style"
      @dblclick.stop="emit('preview', card.index)">
      <img v-if="mediaType === 'image' && urls[card.index]" :src="urls[card.index]" :alt="`生成结果 ${card.index + 1}`" draggable="false" />
      <video v-else-if="urls[card.index]" :src="urls[card.index]" muted playsinline preload="metadata" :aria-label="`生成结果 ${card.index + 1}`" />
      <icon-photo v-else class="placeholder" :size="28" aria-hidden="true" />
      <span class="resultIndex" aria-hidden="true">{{ card.index + 1 }}</span>
      <div class="resultActions">
        <button type="button" :disabled="disabled" title="下载" :aria-label="`下载第 ${card.index + 1} 个结果`" @click.stop="emit('download', card.item, card.index)">
          <icon-download :size="13" aria-hidden="true" /><span>下载</span>
        </button>
        <button type="button" :disabled="disabled" title="创建副本：带上提示词和参数，以这张为输出" :aria-label="`以第 ${card.index + 1} 个结果创建副本`" @click.stop="emit('duplicate', card.item)">
          <icon-copy-plus :size="13" aria-hidden="true" /><span>创建副本</span>
        </button>
        <button type="button" :disabled="disabled" title="设为当前输出" :aria-label="`把第 ${card.index + 1} 个结果设为当前输出`" @click.stop="emit('select', card.item)">
          <icon-star :size="13" class="starIcon" aria-hidden="true" /><span>设为当前</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconCopyPlus, IconDownload, IconPhoto, IconStar } from "@tabler/icons-vue";
import { useNodeFiles } from "@toonflow/nodes-scaffold/workspaceFiles";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/values";

const props = defineProps<{ items: NodeMediaValue[]; mediaType: "image" | "video"; current?: NodeMediaValue; disabled?: boolean }>();
const emit = defineEmits<{ select: [NodeMediaValue]; duplicate: [NodeMediaValue]; preview: [number]; download: [NodeMediaValue, number]; close: [] }>();
const files = useNodeFiles();
const urls = ref<string[]>([]);
const root = ref<HTMLElement>();
const size = ref({ width: 0, height: 0 });

// 卡片与节点卡同尺寸，跟随节点缩放。
watch(root, (element, _previous, onCleanup) => {
  if (!element) return;
  const observer = new ResizeObserver(() => { size.value = { width: element.offsetWidth, height: element.offsetHeight }; });
  observer.observe(element);
  onCleanup(() => observer.disconnect());
}, { flush: "post" });

// 参照 infinite-canvas 的批量展开：最多 4 列，当前结果留在原位占左下角，其余向右、向上铺开。
const cards = computed(() => {
  const { width, height } = size.value;
  const count = props.items.length;
  const columns = Math.min(count, 4);
  const rows = Math.ceil(count / columns);
  const rootSlot = (rows - 1) * columns;
  return props.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.url !== props.current?.url)
    .map(({ item, index }, order) => {
      const slot = order >= rootSlot ? order + 1 : order;
      const x = (slot % columns) * (width + 18);
      const y = (Math.floor(slot / columns) - rows + 1) * (height + 40);
      return {
        item, index,
        style: {
          left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`,
          "--fromX": `${-x}px`, "--fromY": `${-y}px`, "--fromRotate": `${4 + order * 2}deg`,
          animationDelay: `${order * 35}ms`,
        },
      };
    });
});

// 批量结果按文件读取预览地址；列表变化时释放旧地址。
watch(() => props.items.map(item => item.url).join("\n"), async (_value, _previous, onCleanup) => {
  let cancelled = false;
  const owned: string[] = [];
  const shared: { release(): void }[] = [];
  onCleanup(() => {
    cancelled = true;
    shared.forEach(item => item.release());
    owned.forEach(url => URL.revokeObjectURL(url));
  });
  urls.value = [];
  const workspace = files.getWorkspaceFiles();
  const result = await Promise.all(props.items.map(async item => {
    try {
      const handle = workspace.acquireUrl?.(item.url, item.mimeType);
      if (handle) { shared.push(handle); return await handle.url; }
      const url = URL.createObjectURL(new Blob([await workspace.read(item.url)], { type: item.mimeType }));
      owned.push(url);
      return url;
    } catch { return ""; }
  }));
  if (!cancelled) urls.value = result;
}, { immediate: true });
</script>

<style scoped lang="scss">
@keyframes resultIn {
  from { opacity: 0; transform: translate(var(--fromX), var(--fromY)) rotate(var(--fromRotate)) scale(.72); }
  72% { opacity: 1; transform: translate(0, 0) rotate(-1deg) scale(1.015); }
  to { opacity: 1; transform: none; }
}

.mediaResults {
  position: absolute;
  inset: 0;
  pointer-events: none;

  .resultCard {
    position: absolute;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    padding: 8px;
    overflow: hidden;
    border: 1px solid var(--el-border-color-light);
    border-radius: var(--el-card-border-radius, 4px);
    background: var(--el-bg-color);
    box-shadow: 0 18px 50px rgb(28 25 23 / 18%);
    pointer-events: auto;
    animation: resultIn 320ms cubic-bezier(.2, .85, .18, 1) both;
    cursor: zoom-in;

    img,
    video {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: var(--el-border-radius-base);
      object-fit: contain;
      pointer-events: none;
      user-select: none;
    }

    .placeholder { color: var(--el-text-color-placeholder); }

    .resultIndex {
      position: absolute;
      bottom: 14px;
      left: 14px;
      min-width: 20px;
      padding: 0 6px;
      border-radius: 999px;
      background: rgb(0 0 0 / 55%);
      color: #fff;
      font-size: 11px;
      line-height: 20px;
      text-align: center;
      backdrop-filter: blur(8px);
    }

    .resultActions {
      position: absolute;
      top: 14px;
      right: 14px;
      left: 14px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 150ms ease-out;

      button {
        display: inline-flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-width: 0;
        height: 30px;
        padding: 0 6px;
        border: 1px solid var(--el-border-color-light);
        border-radius: 8px;
        background: color-mix(in srgb, var(--el-bg-color) 86%, transparent);
        color: var(--el-text-color-primary);
        font: inherit;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 6px 18px rgb(15 23 42 / 16%);
        backdrop-filter: blur(12px);
        transition: transform 150ms ease-out;

        span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .starIcon { flex-shrink: 0; color: var(--el-color-primary); }
        &:hover:not(:disabled) { transform: scale(1.03); }
        &:disabled { cursor: not-allowed; opacity: .5; }
        &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
      }
    }

    &:hover .resultActions,
    &:focus-within .resultActions { opacity: 1; }
  }
}

@media (prefers-reduced-motion: reduce) {
  .mediaResults .resultCard { animation: none; }
  .mediaResults .resultCard .resultActions { transition: none; }
}
</style>
