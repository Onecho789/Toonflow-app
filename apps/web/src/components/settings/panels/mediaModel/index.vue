<template>
  <div class="providerList">
    <el-alert v-if="error" :title="error" type="error" :closable="false" showIcon />
    <div class="itemList">
      <el-card v-for="item in models" :key="item.modelId" class="providerItem" shadow="never">
        <div class="providerHeader">
          <div class="providerMark" aria-hidden="true"><modelIcon :model="item.modelId" :size="24" /></div>
          <div class="providerInfo">
            <div class="providerHeading">
              <el-text class="providerName" tag="strong">{{ item.label }}</el-text>
            </div>
            <el-text class="providerId" size="small" type="info" :title="item.modelId">{{ item.modelId }}</el-text>
          </div>
        </div>
        <div class="providerFooter">
          <div class="providerMeta">
            <el-tag size="small" type="info" effect="plain">{{ item.type === "image" ? "图片" : "视频" }}</el-tag>
          </div>
        </div>
      </el-card>
      <el-empty v-if="!models.length && !loading" :description="cloudAccount ? '暂无可用模型' : '请先登录麦麦云账号'" />
    </div>
    <div class="providerActions">
      <el-button class="refreshButton" :icon="IconRefresh" :loading="loading" @click="refresh">刷新</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from "axios";
import { onMounted, ref } from "vue";
import { IconRefresh } from "@tabler/icons-vue";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import { cloudAccount } from "@/stores/cloudAccount";

type MediaModel = { modelId: string; label: string; type: "image" | "video" };
const models = ref<MediaModel[]>([]);
const loading = ref(false);
const error = ref("");

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const { data } = await axios.get<{ code: number; data: MediaModel[]; message?: string }>("/api/ai/media/models", { headers: { "Cache-Control": "no-cache" } });
    if (data.code !== 200 || !Array.isArray(data.data)) throw new Error(data.message || "读取媒体模型失败");
    models.value = data.data;
    invalidateNodeModels("media");
  } catch (cause) {
    error.value = axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message || cause.message : cause instanceof Error ? cause.message : String(cause);
  } finally { loading.value = false; }
}

onMounted(refresh);
</script>

<style lang="scss" scoped src="../../providerList.scss"></style>
