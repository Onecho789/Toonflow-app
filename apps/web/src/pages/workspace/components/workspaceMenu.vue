<template>
  <div class="workspaceMenu">
    <el-card shadow="never" :bodyStyle="{ padding: '8px 4px' }">
      <div class="menuContent" role="navigation" aria-label="项目导航">
        <el-button class="toolButton" text aria-label="返回项目列表" title="返回项目列表" @click="exitVisible = true">
          <icon-arrow-left :size="18" aria-hidden="true" />
          <span>返回项目</span>
        </el-button>
        <el-button class="toolButton" text :aria-label="hasDesktopUpdate ? '设置，有新版本可用' : '设置'" title="设置" @click="emit('openSettings')">
          <el-badge isDot :hidden="!hasDesktopUpdate">
            <icon-settings :size="18" aria-hidden="true" />
          </el-badge>
          <span>设置</span>
        </el-button>
      </div>
    </el-card>
    <el-dialog v-model="exitVisible" title="返回项目列表" width="min(360px, calc(100vw - 32px))" alignCenter appendToBody>
      <span>是否离开当前画布并返回项目列表？</span>
      <template #footer>
        <el-button @click="exitVisible = false">取消</el-button>
        <el-button type="primary" :loading="leaving" @click="exitProject">返回项目</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { IconArrowLeft, IconSettings } from "@tabler/icons-vue";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";

const emit = defineEmits<{ openSettings: [] }>();
const router = useRouter();
const exitVisible = ref(false);
const leaving = ref(false);

async function exitProject() {
  if (leaving.value) return;
  leaving.value = true;
  try {
    await router.push("/projects");
  } finally {
    leaving.value = false;
  }
}
</script>

<style scoped lang="scss">
.workspaceMenu {
  width: 184px;

  .menuContent {
    display: flex;
    align-items: center;
    gap: 2px;

    .toolButton {
      flex: 1;
      height: 34px;
      margin: 0;
      padding: 0 8px;
      font-size: 13px;

      :deep(> span) { display: flex; align-items: center; gap: 6px; }
      :deep(.el-badge) { display: flex; align-items: center; }
    }
  }
}
@media (max-width: 420px) {
  .workspaceMenu {
    width: 156px;
    .menuContent .toolButton { padding: 0 4px; font-size: 12px; }
  }
}
</style>
