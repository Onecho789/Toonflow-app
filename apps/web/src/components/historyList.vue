<template>
  <div class="historyList">
    <p v-if="error" class="historyError" role="alert">{{ error }}</p>
    <p v-if="!records.length" class="historyEmpty">还没有生成记录</p>
    <ul v-else class="recordList">
      <li v-for="record in records" :key="record.id">
        <div class="recordItem" :class="{ active: record.id === activeId }" role="button" tabindex="0" :aria-current="record.id === activeId" @click="emit('select', record)" @keydown.enter.self="emit('select', record)">
          <div class="recordThumb">
            <template v-if="coverOf(record)">
              <studioImage v-if="type === 'image'" :directory="directory" :path="coverOf(record)!" alt="" />
              <icon-movie v-else :size="20" aria-hidden="true" />
            </template>
            <el-icon v-else-if="statusOf(record) === 'pending'" class="is-loading" :size="18"><icon-loader-2 /></el-icon>
            <icon-alert-circle v-else :size="20" aria-hidden="true" />
          </div>
          <div class="recordText">
            <p class="recordPrompt" :title="record.prompt">{{ record.prompt }}</p>
            <div class="recordMeta">
              <span class="statusTag" :class="statusOf(record)">{{ statusText(record) }}</span>
              <time :datetime="new Date(record.createdAt).toISOString()">{{ timeText(record.createdAt) }}</time>
            </div>
          </div>
          <el-button class="deleteButton" text size="small" :icon="IconTrash" aria-label="删除这条记录" title="删除记录（文件保留）" @click.stop="emit('remove', record)" />
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ElButton, ElIcon } from "element-plus";
import { IconAlertCircle, IconLoader2, IconMovie, IconTrash } from "@tabler/icons-vue";
import type { HistoryRecord } from "@/stores/workbenchHistory";
import studioImage from "@/pages/imageStudio/studioImage.vue";

defineProps<{ records: HistoryRecord[]; type: "image" | "video"; directory: string; activeId?: string; error?: string }>();
const emit = defineEmits<{ select: [record: HistoryRecord]; remove: [record: HistoryRecord] }>();

const coverOf = (record: HistoryRecord) => record.items.find(item => item.files.length)?.files[0];

function statusOf(record: HistoryRecord) {
  if (record.items.some(item => item.status === "pending")) return "pending";
  return record.items.some(item => item.status === "completed") ? "completed" : "failed";
}

function statusText(record: HistoryRecord) {
  const done = record.items.filter(item => item.status === "completed").length;
  const failed = record.items.filter(item => item.status === "failed").length;
  const status = statusOf(record);
  if (status === "pending") return `生成中 ${done}/${record.items.length}`;
  if (status === "failed") return "失败";
  return failed ? `完成 ${done}/${record.items.length}` : "完成";
}

function timeText(time: number) {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, "0");
  const today = new Date().toDateString() === date.toDateString();
  return `${today ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
</script>

<style lang="scss" scoped>
.historyList {
  padding: 8px;

  .historyError {
    margin: 0 0 8px;
    padding: 8px 10px;
    border-radius: var(--ui-radius);
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
    font-size: 12px;
  }

  .historyEmpty {
    margin: 0;
    padding: 48px 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    text-align: center;
  }

  .recordList {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;

    .recordItem {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-radius: var(--ui-radius);
      cursor: pointer;
      transition: background 0.15s;

      .recordThumb {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        overflow: hidden;
        border-radius: calc(var(--ui-radius) * 0.75);
        background: var(--el-fill-color-light);
        color: var(--el-text-color-secondary);
      }

      .recordText {
        flex: 1;
        min-width: 0;

        .recordPrompt {
          margin: 0 0 4px;
          overflow: hidden;
          font-size: 13px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .recordMeta {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--el-text-color-secondary);
          font-size: 11px;

          .statusTag {
            padding: 0 6px;
            border-radius: 4px;
            line-height: 18px;

            &.pending { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
            &.completed { background: var(--el-color-success-light-9); color: var(--el-color-success); }
            &.failed { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
          }
        }
      }

      .deleteButton { flex-shrink: 0; margin: 0; opacity: 0; }

      &:hover, &:focus-within { background: var(--el-fill-color-light); .deleteButton { opacity: 1; } }
      &.active { background: var(--el-color-primary-light-9); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
    }
  }
}
</style>
