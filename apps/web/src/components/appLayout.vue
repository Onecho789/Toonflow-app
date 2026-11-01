<template>
  <div class="appLayout" :class="{ sidebarCollapsed }" :inert="workspaceStore.projectLoadingVisible">
    <aside id="appSidebar" class="appSidebar" aria-label="主导航">
      <div class="sidebarHeader">
        <div class="sidebarBrand">
          <el-image class="sidebarLogo" :src="logoUrl" fit="contain" alt="麦麦工坊" />
          <span class="brandName">麦麦工坊</span>
        </div>
        <button class="sidebarToggle" type="button" :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" :aria-expanded="!sidebarCollapsed" aria-controls="appSidebar" @click="sidebarCollapsed = !sidebarCollapsed">
          <icon-layout-sidebar-left-expand v-if="sidebarCollapsed" :size="18" aria-hidden="true" />
          <icon-layout-sidebar-left-collapse v-else :size="18" aria-hidden="true" />
        </button>
      </div>
      <nav class="sidebarNav" aria-label="页面导航">
        <router-link v-for="item in navItems" :key="item.path" v-slot="{ href, navigate, isActive }" :to="item.path" custom>
          <a class="sidebarItem" :class="{ active: isActive }" :href="href" :aria-current="isActive ? 'page' : undefined" :aria-label="item.label" :title="item.label" @click="navigate">
            <component :is="item.icon" :size="18" aria-hidden="true" />
            <span class="sidebarText">{{ item.label }}</span>
          </a>
        </router-link>
        <hr class="sidebarDivider" />
        <button class="sidebarItem" :class="{ active: assetsVisible }" type="button" aria-label="素材库" title="素材库" aria-haspopup="dialog" :aria-expanded="assetsVisible" @click="assetsVisible = true">
          <icon-library-photo :size="18" aria-hidden="true" />
          <span class="sidebarText">素材库</span>
        </button>
        <button class="sidebarItem" type="button" aria-label="插件市场" title="插件市场" aria-haspopup="dialog" @click="openSettings('pluginMarket')">
          <icon-building-store :size="18" aria-hidden="true" />
          <span class="sidebarText">插件市场</span>
        </button>
      </nav>
      <div class="sidebarFooter">
        <button v-if="cloudBalance" class="sidebarItem" type="button" :aria-label="`麦麦云余额 ¥${balanceText}，打开账号设置`" :title="cloudBalanceError || '麦麦云余额，点击打开账号设置'" @click="openSettings('account')">
          <icon-coin :size="18" aria-hidden="true" />
          <span class="sidebarText">¥{{ balanceText }}</span>
        </button>
        <button class="sidebarItem" :class="{ connected: deviceHubEnabled || mobileConnection.online === true }" type="button" :aria-label="mobileConnectionLabel" :title="mobileConnectionLabel" @click="mobileConnectVisible = true">
          <span class="sidebarIcon">
            <component :is="deviceHubEnabled || mobileConnection.mode === 'remote' ? IconDeviceDesktop : IconQrcode" :size="18" aria-hidden="true" />
            <span v-if="deviceHubEnabled || mobileConnection.online === true" class="connectionDot" />
          </span>
          <span class="sidebarText">{{ mobileConnectionLabel }}</span>
        </button>
        <button class="sidebarItem" type="button" :aria-label="hasDesktopUpdate ? '设置，有新版本可用' : '设置'" :title="hasDesktopUpdate ? '设置，有新版本可用' : '设置'" @click="openSettings()">
          <span class="sidebarIcon">
            <icon-settings :size="18" aria-hidden="true" />
            <span v-if="hasDesktopUpdate" class="updateDot" />
          </span>
          <span class="sidebarText">设置</span>
        </button>
      </div>
    </aside>
    <div class="layoutContent">
      <router-view />
    </div>
    <assetLibraryDialog v-model="assetsVisible" />
    <settings v-model="settingsVisible" :panel="settingsPanel" />
    <mobileConnect v-model="mobileConnectVisible" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from "vue";
import { IconQrcode, IconDeviceDesktop, IconHome, IconInfinity, IconPhotoAi, IconMovie } from "@tabler/icons-vue";
import logoUrl from "@toonflow/assets/logo.png";
import { useWorkspaceStore } from "@/stores/workspace";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";
import { cloudBalance, cloudBalanceError, useCloudBalanceRefresh } from "@/stores/cloudAccount";
import { deviceHubEnabled, mobileConnection, mobileConnectionLabel } from "@/lib/mobile";
import settings from "@/components/settings/index.vue";
import assetLibraryDialog from "@/pages/home/assetLibraryDialog.vue";

const mobileConnect = defineAsyncComponent(() => import("@/components/mobileConnect.vue"));
const navItems = [
  { path: "/home", label: "首页", icon: IconHome },
  { path: "/projects", label: "无限画布", icon: IconInfinity },
  { path: "/imageStudio", label: "生图工作台", icon: IconPhotoAi },
  { path: "/videoStudio", label: "视频工作台", icon: IconMovie },
];
const workspaceStore = useWorkspaceStore();
const sidebarCollapsed = ref(false);
const assetsVisible = ref(false);
const mobileConnectVisible = ref(false);
const settingsVisible = ref(false);
const settingsPanel = ref<string>();
const balanceText = computed(() => ((cloudBalance.value?.balance ?? 0) / 10000).toFixed(2));
useCloudBalanceRefresh();

function openSettings(panel?: string) {
  settingsPanel.value = panel;
  settingsVisible.value = true;
}
</script>

<style lang="scss" scoped>
.appLayout {
  --sidebarWidth: 240px;
  --sidebarMotion: 220ms;
  --sidebarFade: 140ms;
  display: flex;
  height: 100dvh;
  overflow: hidden;
  color: var(--el-text-color-primary);
  background: color-mix(in srgb, var(--el-bg-color) 96%, var(--el-text-color-primary));

  &.sidebarCollapsed {
    --sidebarWidth: 72px;

    .appSidebar {
      .sidebarHeader {
        .sidebarBrand {
          gap: 0;

          .brandName { max-width: 0; opacity: 0; }
        }

        .sidebarToggle { inset-inline-start: 9px; opacity: 0; }

        @media (min-width: 901px) {
          &:hover, &:has(.sidebarToggle:focus-visible) {
            .sidebarLogo { opacity: 0; }
            .sidebarToggle { opacity: 1; }
          }
        }
      }

      .sidebarItem {
        gap: 0;
        padding-inline: 14px;

        .sidebarText { max-width: 0; opacity: 0; }
      }
    }
  }

  .appSidebar {
    display: flex;
    flex: 0 0 var(--sidebarWidth);
    flex-direction: column;
    width: var(--sidebarWidth);
    padding: 20px 12px 16px;
    overflow-x: hidden;
    overflow-y: auto;
    border-inline-end: 1px solid var(--el-border-color-lighter);
    background: inherit;
    transition: flex-basis var(--sidebarMotion) ease, width var(--sidebarMotion) ease;

    .sidebarHeader {
      position: relative;
      display: flex;
      align-items: center;
      flex-shrink: 0;
      height: 30px;
      gap: 8px;
      margin-bottom: 24px;
      padding: 0 8px;

      .sidebarBrand {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 9px;
        overflow: hidden;
        transition: gap var(--sidebarMotion) ease;

        .sidebarLogo {
          flex-shrink: 0;
          width: 30px;
          height: 30px;
          transition: opacity var(--sidebarFade) ease;
        }

        .brandName {
          max-width: 150px;
          overflow: hidden;
          font-size: 20px;
          font-weight: 600;
          letter-spacing: -0.5px;
          white-space: nowrap;
          transition: max-width var(--sidebarMotion) ease, opacity var(--sidebarFade) ease;
        }
      }

      .sidebarToggle {
        position: absolute;
        top: 1px;
        inset-inline-start: calc(100% - 32px);
        display: grid;
        flex-shrink: 0;
        place-items: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: var(--ui-radius);
        background: transparent;
        color: var(--el-text-color-secondary);
        cursor: pointer;
        transition: inset-inline-start var(--sidebarMotion) ease, opacity var(--sidebarFade) ease;

        &:hover { background: var(--el-fill-color); color: var(--el-text-color-primary); }
        &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
        &:dir(rtl) svg { transform: scaleX(-1); }
      }
    }

    .sidebarItem {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      min-height: 42px;
      width: 100%;
      gap: 10px;
      padding: 10px 12px;
      border: 0;
      border-radius: var(--ui-radius);
      background: transparent;
      color: var(--el-text-color-regular);
      font: inherit;
      font-size: 14px;
      line-height: 1.5;
      text-align: start;
      text-decoration: none;
      cursor: pointer;
      transition: gap var(--sidebarMotion) ease, padding var(--sidebarMotion) ease;

      > svg { flex-shrink: 0; }
      .sidebarText {
        min-width: 0;
        max-width: 180px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        transition: max-width var(--sidebarMotion) ease, opacity var(--sidebarFade) ease;
      }

      .sidebarIcon {
        position: relative;
        display: inline-flex;
        flex-shrink: 0;

        .connectionDot, .updateDot {
          position: absolute;
          top: -2px;
          inset-inline-end: -3px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--el-color-success);
          box-shadow: 0 0 0 2px var(--el-bg-color);
        }

        .updateDot { background: var(--el-color-danger); }
      }

      &:hover { background: var(--el-fill-color); color: var(--el-text-color-primary); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
      &.active { background: var(--el-fill-color-darker); color: var(--el-text-color-primary); font-weight: 500; }
      &.connected { color: var(--el-color-success); }
    }

    .sidebarNav, .sidebarFooter { display: flex; flex-direction: column; gap: 4px; }
    .sidebarNav {
      .sidebarDivider { margin: 12px 8px; border: 0; border-top: 1px solid var(--el-border-color-lighter); }
    }
    .sidebarFooter { margin-top: auto; padding-top: 24px; }

    @media (prefers-reduced-motion: reduce) {
      --sidebarMotion: 0ms;
      --sidebarFade: 0ms;
    }
  }

  .layoutContent {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  @media (max-width: 900px) {
    --sidebarWidth: 72px;

    .appSidebar {
      .sidebarHeader {
        .sidebarBrand {
          gap: 0;

          .brandName { max-width: 0; opacity: 0; }
        }

        .sidebarToggle { display: none; }
      }

      .sidebarItem {
        gap: 0;
        padding-inline: 14px;

        .sidebarText { max-width: 0; opacity: 0; }
      }
    }
  }

  @media (max-width: 560px) {
    .appSidebar .sidebarItem { min-height: 44px; }
  }
}
</style>
