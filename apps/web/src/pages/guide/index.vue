<template>
  <div class="guidePage">
    <nav class="guideToc" aria-label="使用说明目录">
      <template v-for="group in groups" :key="group">
        <h2 class="tocGroup">{{ group }}</h2>
        <button
          v-for="item in chapters.filter(chapter => chapter.group === group)"
          :key="item.id"
          class="tocItem"
          :class="{ active: item.id === active.id }"
          type="button"
          :aria-current="item.id === active.id ? 'page' : undefined"
          @click="open(item.id)">
          {{ item.title }}
        </button>
      </template>
    </nav>
    <el-scrollbar ref="contentScroll" class="guideContent">
      <article class="guideArticle">
        <messageMarkdown :key="active.id" :content="active.content" />
      </article>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ScrollbarInstance } from "element-plus";
import messageMarkdown from "@/components/messageMarkdown.vue";

// 每章一个 Markdown 文件，随客户端一起打包，离线也能看。
const files = import.meta.glob<string>("./chapters/*.md", { query: "?raw", import: "default", eager: true });
const chapterList = [
  { id: "quickStart", title: "快速上手", group: "使用" },
  { id: "canvas", title: "无限画布", group: "使用" },
  { id: "imageStudio", title: "生图工作台", group: "使用" },
  { id: "videoStudio", title: "视频工作台", group: "使用" },
  { id: "agent", title: "小麦同学（对话）", group: "使用" },
  { id: "assets", title: "素材库与提示词库", group: "使用" },
  { id: "plugins", title: "插件市场", group: "使用" },
  { id: "mcp", title: "MCP 接入", group: "使用" },
  { id: "settings", title: "设置一览", group: "使用" },
  { id: "devOverview", title: "开发总览", group: "开发" },
  { id: "skillDev", title: "技能开发", group: "开发" },
  { id: "toolDev", title: "工具插件开发", group: "开发" },
  { id: "nodeDev", title: "节点插件开发", group: "开发" },
  { id: "extDev", title: "文件扩展开发", group: "开发" },
];
const chapters = chapterList.map(item => ({ ...item, content: files[`./chapters/${item.id}.md`] ?? "" }));
const groups = [...new Set(chapters.map(item => item.group))];
const route = useRoute();
const router = useRouter();
const contentScroll = ref<ScrollbarInstance>();
const active = computed(() => chapters.find(item => item.id === route.query.chapter) ?? chapters[0]!);

async function open(id: string) {
  await router.replace({ query: { chapter: id } });
  await nextTick();
  contentScroll.value?.setScrollTop(0);
}
</script>

<style lang="scss" scoped>
.guidePage {
  display: flex;
  height: 100%;
  min-height: 0;

  .guideToc {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 2px;
    width: 200px;
    padding: 24px 12px;
    overflow-y: auto;
    border-right: 1px solid var(--el-border-color-lighter);

    .tocGroup {
      margin: 16px 10px 6px;
      color: var(--el-text-color-secondary);
      font-size: 12px;
      font-weight: 500;

      &:first-child { margin-top: 0; }
    }

    .tocItem {
      padding: 8px 10px;
      border: none;
      border-radius: var(--el-border-radius-base);
      background: none;
      color: var(--el-text-color-regular);
      font: inherit;
      font-size: 14px;
      text-align: left;
      cursor: pointer;

      &:hover { background: var(--el-fill-color-light); }

      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }

      &.active {
        background: var(--el-color-primary-light-9);
        color: var(--el-color-primary);
        font-weight: 500;
      }
    }
  }

  .guideContent {
    flex: 1;
    min-width: 0;
    height: 100%;

    .guideArticle {
      max-width: 860px;
      margin: 0 auto;
      padding: 28px 32px 48px;
      font-size: 15px;
      line-height: 1.75;
    }
  }

  @media (max-width: 720px) {
    flex-direction: column;

    .guideToc {
      flex-direction: row;
      flex-wrap: wrap;
      width: auto;
      padding: 12px;
      border-right: none;
      border-bottom: 1px solid var(--el-border-color-lighter);

      .tocGroup { display: none; }
    }

    .guideContent .guideArticle { padding: 20px 16px 40px; }
  }
}
</style>
