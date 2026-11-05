<template>
  <div class="mediaResults nodrag nopan" :class="`count${Math.min(items.length, 4)}`">
    <div class="resultsHead">
      <span class="resultsTitle">{{ items.length }} 个结果</span>
      <el-button size="small" text :icon="mediaType === 'image' ? IconPhotoPlus : IconVideoPlus" :disabled="disabled" @click.stop="emit('split', items)">全部拆分</el-button>
      <el-button size="small" text :icon="IconX" title="收起" aria-label="收起结果" @click.stop="emit('close')" />
    </div>
    <div class="resultGrid" role="list" :aria-label="mediaType === 'image' ? '生成图片' : '生成视频'">
      <div
        v-for="(item, index) in items"
        :key="item.url"
        class="resultItem"
        role="listitem"
        :style="{ animationDelay: `${index * 35}ms` }"
        :class="{ selected: item.url === current?.url }">
        <button type="button" class="resultPreview" :aria-pressed="item.url === current?.url" :aria-label="`设为当前结果：第 ${index + 1} 个`" :disabled="disabled" @click.stop="emit('select', item)" @dblclick.stop="emit('preview', index)">
          <img v-if="mediaType === 'image' && urls[index]" :src="urls[index]" :alt="`生成结果 ${index + 1}`" draggable="false" />
          <video v-else-if="urls[index]" :src="urls[index]" muted playsinline preload="metadata" :aria-label="`生成结果 ${index + 1}`" />
          <icon-photo v-else :size="24" aria-hidden="true" />
        </button>
        <span v-if="item.url === current?.url" class="currentMark">当前</span>
        <div class="resultActions">
          <el-button size="small" :icon="IconMaximize" title="查看大图" aria-label="查看大图" @click.stop="emit('preview', index)" />
          <el-button size="small" :icon="mediaType === 'image' ? IconPhotoPlus : IconVideoPlus" :disabled="disabled" title="拆分为新节点" aria-label="拆分为新节点" @click.stop="emit('split', [item])" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElButton } from "element-plus";
import { IconMaximize, IconPhoto, IconPhotoPlus, IconVideoPlus, IconX } from "@tabler/icons-vue";
import { useNodeFiles } from "@toonflow/nodes-scaffold/workspaceFiles";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/values";

const props = defineProps<{ items: NodeMediaValue[]; mediaType: "image" | "video"; current?: NodeMediaValue; disabled?: boolean }>();
const emit = defineEmits<{ select: [NodeMediaValue]; split: [NodeMediaValue[]]; preview: [number]; close: [] }>();
const files = useNodeFiles();
const urls = ref<string[]>([]);

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
  from { opacity: 0; transform: translateY(8px) scale(.96); }
}

.mediaResults {
  box-sizing: border-box;
  width: max-content;
  padding: 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  background: var(--el-bg-color);
  box-shadow: 0 12px 36px rgb(0 0 0 / 12%);

  .resultsHead {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 0 8px 4px;

    .resultsTitle {
      flex: 1;
      color: var(--el-text-color-primary);
      font-size: 13px;
      font-weight: 600;
    }

    .el-button { margin: 0; }
  }

  .resultGrid {
    display: grid;
    grid-template-columns: repeat(4, 112px);
    gap: 8px;
  }

  &.count1 .resultGrid { grid-template-columns: 112px; }
  &.count2 .resultGrid { grid-template-columns: repeat(2, 112px); }
  &.count3 .resultGrid { grid-template-columns: repeat(3, 112px); }

  .resultItem {
    position: relative;
    overflow: hidden;
    border: 2px solid transparent;
    border-radius: 10px;
    background: var(--el-fill-color-light);
    animation: resultIn 320ms cubic-bezier(.2, .8, .2, 1) backwards;
    transition: transform 150ms ease-out, border-color 150ms ease-out;

    &:hover { transform: translateY(-2px); }
    &.selected { border-color: var(--el-color-primary); }

    .resultPreview {
      display: grid;
      place-items: center;
      width: 100%;
      aspect-ratio: 1;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--el-text-color-placeholder);
      cursor: pointer;

      img,
      video { width: 100%; height: 100%; object-fit: cover; }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
    }

    .currentMark {
      position: absolute;
      top: 6px;
      left: 6px;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--el-color-primary);
      color: #fff;
      font-size: 11px;
      line-height: 18px;
      pointer-events: none;
    }

    .resultActions {
      position: absolute;
      right: 6px;
      bottom: 6px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 150ms ease-out;

      .el-button { width: 26px; height: 26px; margin: 0; padding: 0; border-radius: 8px; }
    }

    &:hover .resultActions,
    &:focus-within .resultActions { opacity: 1; }
  }
}

@media (prefers-reduced-motion: reduce) {
  .mediaResults .resultItem { animation: none; transition: none; }
  .mediaResults .resultItem:hover { transform: none; }
  .mediaResults .resultItem .resultActions { transition: none; }
}
</style>
