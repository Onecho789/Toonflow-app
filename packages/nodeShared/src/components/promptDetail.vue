<template>
  <el-dialog v-model="visible" :title="item?.title" width="min(720px, calc(100vw - 32px))" appendToBody>
    <div v-if="item" class="promptDetail nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
      <div v-if="images.length" class="detailImages">
        <button v-for="(url, index) in images" :key="url" type="button" class="detailImage" :aria-label="`查看图片 ${index + 1}`" @click="openImage(index)">
          <img :src="url" alt="" loading="lazy" referrerpolicy="no-referrer" />
        </button>
      </div>
      <div v-if="item.tags?.length" class="detailTags">
        <el-tag v-for="tag in item.tags" :key="tag" size="small" type="info">{{ tag }}</el-tag>
      </div>
      <p v-if="item.description" class="detailDescription">{{ item.description }}</p>
      <pre class="detailPrompt">{{ item.prompt }}</pre>
      <p v-if="item.author || item.sourceUrl" class="detailSource">
        <span v-if="item.author">作者：{{ item.author }}</span>
        <a v-if="item.sourceUrl" :href="item.sourceUrl" target="_blank" rel="noopener noreferrer">查看来源</a>
      </p>
    </div>
    <template #footer>
      <el-button :icon="IconCopy" @click="copyPrompt">复制</el-button>
      <el-button v-if="fillLabel" type="primary" :disabled="fillDisabled" @click="item && emit('fill', item)">{{ fillLabel }}</el-button>
    </template>
  </el-dialog>
  <mediaPreview v-model="previewVisible" v-model:index="previewIndex" :items="previewItems" />
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { ElButton, ElDialog, ElMessage, ElTag } from "element-plus";
import { IconCopy } from "@tabler/icons-vue";
import mediaPreview from "./mediaPreview.vue";
import { showNodeError } from "../showNodeError";
import type { CloudPromptItem } from "../cloudPrompts";

const props = defineProps<{ item?: CloudPromptItem; fillLabel?: string; fillDisabled?: boolean }>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ fill: [item: CloudPromptItem] }>();
const writeClipboardText = inject<(text: string) => Promise<void>>("writeClipboardText", text => navigator.clipboard.writeText(text));
const previewVisible = ref(false);
const previewIndex = ref(0);
const images = computed(() => [...new Set([props.item?.coverUrl, ...props.item?.referenceImageUrls ?? []].filter((url): url is string => !!url))]);
const previewItems = computed(() => images.value.map((url, index) => ({ url, type: "image" as const, name: props.item?.title, source: index ? `参考图 ${index}` : "封面" })));

function openImage(index: number) {
  previewIndex.value = index;
  previewVisible.value = true;
}

async function copyPrompt() {
  if (!props.item) return;
  try {
    await writeClipboardText(props.item.prompt);
    ElMessage.success("提示词已复制");
  } catch (error) {
    showNodeError(error, "复制提示词失败");
  }
}
</script>

<style lang="scss" scoped>
.promptDetail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 64vh;
  overflow: auto;

  .detailImages {
    display: flex;
    gap: 8px;
    overflow-x: auto;

    .detailImage {
      flex-shrink: 0;
      height: 160px;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
      background: var(--el-fill-color-light);
      cursor: zoom-in;

      img {
        display: block;
        height: 100%;
        object-fit: contain;
      }
    }
  }

  .detailTags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .detailDescription {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.6;
  }

  .detailPrompt {
    margin: 0;
    padding: 12px;
    border-radius: var(--el-border-radius-base);
    background: var(--el-fill-color-light);
    font-family: inherit;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .detailSource {
    display: flex;
    gap: 12px;
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;

    a { color: var(--el-color-primary); }
  }
}
</style>
