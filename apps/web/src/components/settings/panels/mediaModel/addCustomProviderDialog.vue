<template>
  <el-dialog
    v-model="visible"
    title="添加自定义媒体供应商"
    width="min(550px, 94vw)"
    alignCenter
    appendToBody
    destroyOnClose
    :closeOnClickModal="false"
    :closeOnPressEscape="!connectionForm?.saving"
    :showClose="!connectionForm?.saving">
    <el-scrollbar maxHeight="min(65dvh, calc(100dvh - 160px))">
      <customProviderForm ref="connectionForm" @saved="emit('added', $event)" @completed="visible = false" />
    </el-scrollbar>
    <template #footer>
      <el-button class="importButton" text :disabled="connectionForm?.busy" @click="connectionForm?.openAdapter()">导入供应商文件</el-button>
      <el-button :disabled="connectionForm?.saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="connectionForm?.saving" :disabled="connectionForm?.busy || !connectionForm?.canSubmit" @click="connectionForm?.submit()">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { MediaProvider } from "./types";
import customProviderForm from "./customProviderForm.vue";

const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ added: [provider: MediaProvider] }>();
const connectionForm = ref<InstanceType<typeof customProviderForm>>();
</script>

<style lang="scss" scoped>
.importButton { float: left; }
</style>
