<template>
  <el-button class="promptLibraryButton" :icon="IconBook" :disabled="disabled" text title="提示词库" aria-label="提示词库" @click.stop="openLibrary" />
  <el-dialog v-model="visible" :title="`${type === 'image' ? '图片' : '视频'}提示词库`" width="min(1080px, calc(100vw - 32px))" appendToBody>
    <div v-loading="loading" class="promptLibrary nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
      <el-empty v-else-if="!loading && !sources.length" description="暂无可用的提示词库" />
      <div v-else-if="sources.length" class="libraryContent">
        <div class="librarySide">
          <div class="sourceList" role="listbox" aria-label="提示词来源">
            <button v-for="source in sourceOptions" :key="source.id" type="button" class="sourceItem" :class="{ selected: sourceId === source.id }" role="option" :aria-selected="sourceId === source.id" @click="sourceId = source.id">
              <span class="sourceName">{{ source.name }}</span>
              <span class="sourceCount">{{ source.count }}</span>
            </button>
          </div>
          <div v-if="tags.length" class="tagList" aria-label="标签">
            <el-check-tag v-for="tag in tags" :key="tag" :checked="activeTag === tag" @change="activeTag = activeTag === tag ? '' : tag">{{ tag }}</el-check-tag>
          </div>
        </div>
        <div class="libraryMain">
          <el-input v-model="query" :prefixIcon="IconSearch" placeholder="搜索标题、提示词或标签" aria-label="搜索提示词" clearable />
          <div class="cardGrid" role="list" aria-label="提示词">
            <div v-for="item in pageItems" :key="item.id" class="promptCard" role="listitem">
              <button type="button" class="cardMain" :title="item.title" @click="detailItem = item; detailVisible = true">
                <span class="cardCover">
                  <img v-if="item.coverUrl" :src="item.coverUrl" alt="" loading="lazy" referrerpolicy="no-referrer" />
                  <icon-photo v-else :size="28" stroke="1.25" />
                </span>
                <span class="cardTitle">{{ item.title }}</span>
                <span class="cardPrompt">{{ item.description || item.prompt }}</span>
              </button>
              <el-button class="fillButton" size="small" type="primary" plain @click="choose(item)">使用</el-button>
            </div>
          </div>
          <el-empty v-if="!filteredItems.length" description="没有匹配的提示词" :imageSize="80" />
          <el-pagination v-model:currentPage="page" :pageSize="pageSize" :total="filteredItems.length" layout="prev, pager, next" hideOnSinglePage />
        </div>
      </div>
    </div>
  </el-dialog>
  <promptDetail v-model="detailVisible" :item="detailItem" fillLabel="使用" @fill="choose" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElAlert, ElButton, ElCheckTag, ElDialog, ElEmpty, ElInput, ElPagination, vLoading } from "element-plus";
import { IconBook, IconPhoto, IconSearch } from "@tabler/icons-vue";
import promptDetail from "./promptDetail.vue";
import { readCloudPrompts, type CloudPromptItem, type CloudPromptSource } from "../cloudPrompts";

const props = defineProps<{ type: "image" | "video"; disabled?: boolean }>();
// 第二个参数是提示词自带的参考图地址，工作台据此带入参考图；画布节点只用提示词。
const emit = defineEmits<{ select: [prompt: string, referenceImageUrls: string[]] }>();
const visible = ref(false);
const loading = ref(false);
const loadError = ref("");
const sources = ref<CloudPromptSource[]>([]);
const sourceId = ref(0);
const activeTag = ref("");
const query = ref("");
const page = ref(1);
const pageSize = 24;
const detailVisible = ref(false);
const detailItem = ref<CloudPromptItem>();

const sourceOptions = computed(() => [
  { id: 0, name: "全部", count: sources.value.reduce((total, source) => total + source.items.length, 0) },
  ...sources.value.map(source => ({ id: source.id, name: source.name, count: source.items.length })),
]);
const sourceItems = computed(() => sourceId.value ? sources.value.find(source => source.id === sourceId.value)?.items ?? [] : sources.value.flatMap(source => source.items));
// ACT: 标签按出现次数取前 40 个，来源很多时只展示常用标签。
const tags = computed(() => {
  const counts = new Map<string, number>();
  for (const item of sourceItems.value) for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([tag]) => tag);
});
const filteredItems = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  return sourceItems.value.filter(item => (!activeTag.value || item.tags?.includes(activeTag.value))
    && (!keyword || `${item.title} ${item.prompt} ${item.tags?.join(" ") ?? ""}`.toLocaleLowerCase().includes(keyword)));
});
const pageItems = computed(() => filteredItems.value.slice((page.value - 1) * pageSize, page.value * pageSize));

watch([sourceId, activeTag, query], () => { page.value = 1; });
watch(sourceId, () => { activeTag.value = ""; });

async function openLibrary() {
  visible.value = true;
  loading.value = true;
  loadError.value = "";
  try {
    sources.value = (await readCloudPrompts()).filter(source => source.type === props.type);
    if (!sources.value.some(source => source.id === sourceId.value)) sourceId.value = 0;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "提示词库读取失败";
  } finally {
    loading.value = false;
  }
}

function choose(item: CloudPromptItem) {
  emit("select", item.prompt, item.referenceImageUrls ?? []);
  detailVisible.value = false;
  visible.value = false;
}
</script>

<style lang="scss" scoped>
.promptLibrary {
  min-height: 360px;

  .libraryContent {
    display: flex;
    gap: 16px;
    height: min(620px, 66vh);
  }

  .librarySide {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 12px;
    width: 200px;
    overflow: auto;

    .sourceList {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sourceItem {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border: 0;
      border-radius: var(--el-border-radius-base);
      background: transparent;
      color: var(--el-text-color-primary);
      font: inherit;
      font-size: 13px;
      text-align: left;
      cursor: pointer;

      &:hover { background: var(--el-fill-color-light); }
      &.selected { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }

      .sourceName {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sourceCount {
        color: var(--el-text-color-secondary);
        font-size: 12px;
      }
    }

    .tagList {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;

      .el-check-tag { padding: 3px 8px; font-size: 12px; font-weight: normal; }
    }
  }

  .libraryMain {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    min-width: 0;

    .cardGrid {
      display: grid;
      flex: 1;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      align-content: start;
      gap: 12px;
      min-height: 0;
      overflow: auto;
    }

    .el-pagination { justify-content: center; }
  }

  .promptCard {
    position: relative;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
    overflow: hidden;

    &:hover .fillButton { opacity: 1; }

    .cardMain {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      padding: 0 0 10px;
      border: 0;
      background: transparent;
      color: var(--el-text-color-primary);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .cardCover {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 120px;
      margin-bottom: 4px;
      background: var(--el-fill-color-light);
      color: var(--el-text-color-placeholder);

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .cardTitle,
    .cardPrompt {
      padding: 0 10px;
      overflow: hidden;
    }

    .cardTitle {
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cardPrompt {
      display: -webkit-box;
      color: var(--el-text-color-secondary);
      font-size: 12px;
      line-height: 1.5;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .fillButton {
      position: absolute;
      top: 8px;
      right: 8px;
      opacity: 0;

      &:focus-visible { opacity: 1; }
    }
  }
}
</style>
