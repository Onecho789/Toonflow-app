<template>
  <div class="mediaResults nodrag nopan" :class="`count${Math.min(items.length, 4)}`" role="list" :aria-label="mediaType === 'image' ? '生成图片' : '生成视频'">
    <div
      v-for="(item, index) in items"
      :key="item.url"
      class="resultItem"
      role="listitem"
      :class="{ selected: item.url === current?.url }">
      <button type="button" class="resultPreview" :aria-pressed="item.url === current?.url" :aria-label="`设为当前结果：第 ${index + 1} 个`" :disabled="disabled" @click.stop="emit('select', item)" @dblclick.stop="emit('preview', index)">
        <img v-if="mediaType === 'image' && urls[index]" :src="urls[index]" :alt="`生成结果 ${index + 1}`" draggable="false" />
        <video v-else-if="urls[index]" :src="urls[index]" muted playsinline preload="metadata" :aria-label="`生成结果 ${index + 1}`" />
        <icon-photo v-else :size="24" aria-hidden="true" />
      </button>
      <el-button class="splitButton" size="small" :icon="mediaType === 'image' ? IconPhotoPlus : IconVideoPlus" :disabled="disabled" title="拆分为新节点" aria-label="拆分为新节点" @click.stop="emit('split', [item])" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElButton } from "element-plus";
import { IconPhoto, IconPhotoPlus, IconVideoPlus } from "@tabler/icons-vue";
import { useNodeFiles } from "@toonflow/nodes-scaffold/workspaceFiles";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/values";

const props = defineProps<{ items: NodeMediaValue[]; mediaType: "image" | "video"; current?: NodeMediaValue; disabled?: boolean }>();
const emit = defineEmits<{ select: [NodeMediaValue]; split: [NodeMediaValue[]]; preview: [number] }>();
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
@keyframes resultFadeIn {
  from { opacity: 0; }
}

.mediaResults {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  width: 100%;

  &.count1 { grid-template-columns: minmax(0, 1fr); }

  .resultItem {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
    background: var(--el-fill-color-light);
    animation: resultFadeIn 120ms ease-out;
    transition: transform 120ms ease-out, border-color 120ms ease-out;

    &:hover { transform: translateY(-1px); }
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

    .splitButton {
      position: absolute;
      top: 4px;
      right: 4px;
      opacity: 0;
      transition: opacity 120ms ease-out;
    }

    &:hover .splitButton,
    &:focus-within .splitButton { opacity: 1; }
  }
}

@media (prefers-reduced-motion: reduce) {
  .mediaResults .resultItem { animation: none; transition: none; }
  .mediaResults .resultItem:hover { transform: none; }
  .mediaResults .resultItem .splitButton { transition: none; }
}
</style>
