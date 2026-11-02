<template>
  <span class="mailangBalance">
    <icon-wheat class="balanceIcon" :size="18" aria-hidden="true" />
    <span class="balanceText">
      <strong class="balanceValue">{{ cloudBalanceText }}</strong>
      <span class="balanceUnit">麦浪</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { IconWheat } from "@tabler/icons-vue";
import { cloudBalanceText } from "@/stores/cloudAccount";
</script>

<style lang="scss" scoped>
.mailangBalance {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;

  .balanceIcon {
    flex-shrink: 0;
    color: #b86e00;

    .dark & { color: #f0a52a; }
  }

  .balanceText {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;

    .balanceValue {
      color: var(--el-text-color-primary);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .balanceUnit {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
  }
}
</style>
