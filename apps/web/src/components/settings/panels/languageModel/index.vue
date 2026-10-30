<template>
  <div class="providerList">
    <el-alert v-if="error" :title="error" type="error" :closable="false" showIcon />
    <div class="itemList">
      <el-card v-for="item in aiModels" :key="item.modelId" class="providerItem" shadow="never">
        <div class="providerHeader">
          <div class="providerMark" aria-hidden="true"><modelIcon :model="item.modelId" :vendor="item.vendor" :size="24" /></div>
          <div class="providerInfo">
            <div class="providerHeading">
              <el-text class="providerName" tag="strong">{{ item.label }}</el-text>
            </div>
            <el-text class="providerId" size="small" type="info" :title="item.modelId">{{ item.modelId }}</el-text>
          </div>
        </div>
        <div class="providerFooter">
          <div class="providerMeta">
            <el-text v-if="item.contextWindow" size="small" type="info">上下文 {{ item.contextWindow.toLocaleString() }}</el-text>
            <el-tag v-if="item.reasoningLevels.length" size="small" type="info" effect="plain">支持思考</el-tag>
          </div>
        </div>
      </el-card>
      <el-empty v-if="!aiModels.length && !loading" :description="cloudAccount ? '暂无可用模型' : '请先登录麦麦云账号'" />
    </div>
    <div class="providerActions">
      <el-button class="refreshButton" :icon="IconRefresh" :loading="loading" @click="refresh">刷新</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconRefresh } from "@tabler/icons-vue";
import { aiModels, loadAiModels } from "@/stores/settings";
import { cloudAccount } from "@/stores/cloudAccount";

const loading = ref(false);
const error = ref("");

async function refresh() {
  loading.value = true;
  error.value = "";
  try { await loadAiModels(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { loading.value = false; }
}
</script>

<style lang="scss" scoped src="../../providerList.scss"></style>
