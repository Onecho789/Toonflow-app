<template>
  <div class="account">
    <section class="settingSection" aria-labelledby="accountTitle">
      <h3 id="accountTitle">麦麦云账号</h3>
      <div v-if="cloudAccount" class="accountRow">
        <div class="accountInfo">
          <span class="email" dir="ltr">{{ cloudAccount.email }}</span>
          <el-tag v-if="cloudAccount.role >= 10" size="small">管理员</el-tag>
        </div>
        <el-button :loading="cloudAccountLoading" @click="logoutCloudAccount">退出登录</el-button>
      </div>
      <div v-if="cloudAccount" class="accountRow">
        <div class="accountInfo">
          <span>余额</span>
          <strong class="balance">{{ cloudBalance ? `¥${(cloudBalance.balance / 10000).toFixed(2)}` : "—" }}</strong>
          <el-button text :icon="IconRefresh" :loading="cloudBalanceLoading" aria-label="刷新余额" @click="loadCloudBalance" />
        </div>
        <el-button v-if="cloudBalance" tag="a" type="primary" :href="cloudBalance.walletUrl" target="_blank" rel="noopener noreferrer">充值</el-button>
      </div>
      <p class="description">项目文件始终保存在本机。</p>
      <el-alert v-if="cloudBalanceError" :title="cloudBalanceError" type="error" :closable="false" showIcon />
      <el-alert v-if="cloudAccountError" :title="cloudAccountError" type="error" :closable="false" showIcon />
    </section>
  </div>
</template>

<script setup lang="ts">
import { IconRefresh } from "@tabler/icons-vue";
import { cloudAccount, cloudAccountError, cloudAccountLoading, cloudBalance, cloudBalanceError, cloudBalanceLoading, loadCloudBalance, logoutCloudAccount } from "@/stores/cloudAccount";

void loadCloudBalance();
</script>

<style lang="scss" scoped>
.account {
  padding: 0 4px 8px;

  .settingSection {
    display: flex;
    flex-direction: column;
    gap: 12px;

    h3 {
      margin: 0;
      color: var(--el-text-color-primary);
      font-size: 14px;
      font-weight: 600;
    }

    .accountRow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;

      .accountInfo {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;

        .email {
          overflow-wrap: anywhere;
        }

        .balance {
          font-variant-numeric: tabular-nums;
        }
      }
    }

    .description {
      margin: 0;
      color: var(--el-text-color-secondary);
      font-size: 13px;
      line-height: 1.6;
    }
  }
}
</style>
