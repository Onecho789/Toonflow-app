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
      <div v-else class="accountRow">
        <span class="description">未登录</span>
        <el-button type="primary" :loading="cloudAccountLoading" @click="startCloudLogin">登录</el-button>
      </div>
      <p class="description">登录会在系统浏览器中打开麦麦云，完成后自动返回客户端。项目文件始终保存在本机。</p>
      <el-alert v-if="cloudAccountError" :title="cloudAccountError" type="error" :closable="false" showIcon />
    </section>
  </div>
</template>

<script setup lang="ts">
import { cloudAccount, cloudAccountError, cloudAccountLoading, loadCloudAccount, logoutCloudAccount, startCloudLogin } from "@/stores/cloudAccount";

void loadCloudAccount();
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
