<template>
  <div class="workbenchLayout">
    <aside class="settingsCard" aria-label="生成参数">
      <el-scrollbar class="settingsScroll">
        <div class="settingsBody">
          <slot name="settings" />
        </div>
      </el-scrollbar>
      <div class="actionBar">
        <slot name="actions" />
      </div>
    </aside>
    <section class="resultCard" aria-labelledby="workbenchResultTitle">
      <header class="resultHeader">
        <h2 id="workbenchResultTitle">生成结果</h2>
        <span v-if="count" class="resultCount">{{ count }}</span>
        <div class="resultExtra"><slot name="resultExtra" /></div>
      </header>
      <el-scrollbar class="resultScroll">
        <div v-loading="loading" class="resultBody" :aria-busy="loading">
          <slot v-if="!empty" name="results" />
          <div v-else-if="!loading" class="resultEmpty">
            <span class="emptyIcon"><component :is="type === 'image' ? IconPhotoSpark : IconMovie" :size="34" stroke="1.4" aria-hidden="true" /></span>
            <strong>{{ type === "image" ? "还没有生成图片" : "还没有生成视频" }}</strong>
            <p>{{ type === "image" ? "在左侧写下想要的画面，选好比例后点击生成，结果会出现在这里。" : "在左侧写下想要的镜头，可上传首帧或尾帧，生成的视频会出现在这里。" }}</p>
            <ol class="emptySteps">
              <li><span>1</span>描述画面</li>
              <li><span>2</span>{{ type === "image" ? "生成图片" : "生成视频" }}</li>
              <li><span>3</span>挑中的加入素材库</li>
            </ol>
          </div>
        </div>
      </el-scrollbar>
    </section>
  </div>
</template>

<script setup lang="ts">
import { vLoading } from "element-plus";
import { IconMovie, IconPhotoSpark } from "@tabler/icons-vue";

defineProps<{ type: "image" | "video"; count: number; empty: boolean; loading?: boolean }>();
</script>

<style lang="scss" scoped>
.workbenchLayout {
  display: flex;
  gap: 16px;
  height: 100%;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;

  .settingsCard,
  .resultCard {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: calc(var(--ui-radius) * 2);
    background: var(--el-bg-color-overlay);
    box-shadow: var(--el-box-shadow-lighter);
  }

  .settingsCard {
    flex-shrink: 0;
    width: 380px;

    .settingsScroll { flex: 1; min-height: 0; }

    .settingsBody {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 20px;

      :deep(.fieldLabel) {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 24px;
        margin-top: 10px;
        color: var(--el-text-color-primary);
        font-size: 13px;
        font-weight: 600;

        &:first-child { margin-top: 0; }

        .fieldHint { color: var(--el-text-color-secondary); font-size: 12px; font-weight: 400; }
      }
    }

    .actionBar {
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex-shrink: 0;
      padding: 14px 20px 18px;
      border-top: 1px solid var(--el-border-color-lighter);
      background: color-mix(in srgb, var(--el-color-primary) 4%, var(--el-bg-color-overlay));
    }
  }

  .resultCard {
    flex: 1;
    min-width: 0;

    .resultHeader {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      padding: 16px 20px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.5; }

      .resultCount {
        min-width: 22px;
        padding: 0 8px;
        border-radius: 999px;
        background: var(--el-fill-color);
        color: var(--el-text-color-secondary);
        font-size: 12px;
        line-height: 22px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }

      .resultExtra {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-inline-start: auto;
      }
    }

    .resultScroll { flex: 1; min-height: 0; }

    .resultBody {
      min-height: 100%;
      padding: 20px;
      box-sizing: border-box;

      .resultEmpty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 420px;
        padding: 32px 24px;
        border: 1px dashed var(--el-border-color);
        border-radius: calc(var(--ui-radius) * 1.5);
        background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--el-color-primary) 9%, transparent), transparent 60%);
        text-align: center;
        box-sizing: border-box;

        .emptyIcon {
          display: grid;
          place-items: center;
          width: 72px;
          height: 72px;
          margin-bottom: 6px;
          border-radius: 22px;
          background: linear-gradient(135deg, var(--el-color-primary-light-8), var(--el-color-primary-light-9));
          color: var(--el-color-primary);
          box-shadow: 0 8px 24px color-mix(in srgb, var(--el-color-primary) 18%, transparent);
        }

        strong { font-size: 16px; font-weight: 600; }

        p {
          max-width: 360px;
          margin: 0;
          color: var(--el-text-color-secondary);
          font-size: 13px;
          line-height: 1.7;
        }

        .emptySteps {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px 20px;
          margin: 14px 0 0;
          padding: 0;
          list-style: none;
          color: var(--el-text-color-regular);
          font-size: 12px;

          li {
            display: flex;
            align-items: center;
            gap: 6px;

            span {
              display: grid;
              place-items: center;
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background: var(--el-color-primary-light-8);
              color: var(--el-color-primary);
              font-size: 11px;
              font-weight: 600;
            }
          }
        }
      }
    }
  }

  @media (max-width: 900px) {
    flex-direction: column;
    height: auto;
    min-height: 100%;

    .settingsCard { width: auto; }
    .resultCard { min-height: 480px; }
  }
}
</style>
