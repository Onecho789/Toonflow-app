<template>
  <main class="loginGate">
    <section class="loginCard" aria-labelledby="loginTitle">
      <div class="brand">
        <img class="brandLogo" :src="logoUrl" alt="" />
        <h1 id="loginTitle">{{ mustChangePassword ? "修改初始密码" : mode === "login" ? "登录麦麦工坊" : "注册麦麦云账号" }}</h1>
      </div>

      <el-form v-if="mustChangePassword" labelPosition="top" size="large" :disabled="cloudAccountLoading" @submit.prevent="changeCloudPassword(form.oldPassword, form.newPassword)">
        <p class="description">首次登录请先设置新密码</p>
        <el-form-item label="原密码">
          <el-input v-model="form.oldPassword" type="password" autocomplete="current-password" showPassword :maxlength="128" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="form.newPassword" type="password" autocomplete="new-password" showPassword placeholder="至少 8 位" :maxlength="128" />
        </el-form-item>
        <el-button type="primary" nativeType="submit" :loading="cloudAccountLoading" :disabled="!form.oldPassword || form.newPassword.length < 8">修改密码</el-button>
        <el-button link @click="logoutCloudAccount">退出登录</el-button>
      </el-form>

      <el-form v-else labelPosition="top" size="large" :disabled="cloudAccountLoading" @submit.prevent="submit">
        <el-form-item label="邮箱">
          <el-input v-model="form.email" type="email" dir="ltr" autocomplete="email" :maxlength="254" />
        </el-form-item>
        <el-form-item v-if="mode === 'register'" label="验证码">
          <div class="codeRow">
            <el-input v-model="form.code" inputmode="numeric" autocomplete="one-time-code" :maxlength="6" />
            <el-button :disabled="!form.email || countdown > 0" @click="sendCode">{{ countdown > 0 ? `${countdown} 秒后重发` : "获取验证码" }}</el-button>
          </div>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" showPassword :placeholder="mode === 'register' ? '至少 8 位' : ''" :maxlength="128" />
        </el-form-item>
        <el-button type="primary" nativeType="submit" :loading="cloudAccountLoading" :disabled="!canSubmit">{{ mode === "login" ? "登录" : "注册" }}</el-button>
        <p class="switchMode">
          {{ mode === "login" ? "还没有账号？" : "已有账号？" }}
          <el-button link type="primary" @click="switchMode">{{ mode === "login" ? "注册" : "登录" }}</el-button>
        </p>
      </el-form>

      <el-alert v-if="cloudAccountError" :title="cloudAccountError" type="error" :closable="false" showIcon />
      <p v-if="codeSent" class="description" role="status">验证码已发送，请查收邮件</p>
      <p class="description">项目文件始终保存在本机。</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import logoUrl from "@toonflow/assets/logo.svg";
import { changeCloudPassword, cloudAccount, cloudAccountError, cloudAccountLoading, loginCloudAccount, logoutCloudAccount, registerCloudAccount, sendCloudCode } from "@/stores/cloudAccount";

const mode = ref<"login" | "register">("login");
const form = reactive({ email: "", password: "", code: "", oldPassword: "", newPassword: "" });
const countdown = ref(0);
const codeSent = ref(false);
let countdownTimer: ReturnType<typeof setInterval> | undefined;
const mustChangePassword = computed(() => cloudAccount.value?.mustChangePassword === true);
const canSubmit = computed(() => form.email && (mode.value === "login" ? form.password : form.password.length >= 8 && /^\d{6}$/.test(form.code)));

function switchMode() {
  mode.value = mode.value === "login" ? "register" : "login";
  cloudAccountError.value = "";
  codeSent.value = false;
}

function submit() {
  return mode.value === "login" ? loginCloudAccount(form.email, form.password) : registerCloudAccount(form.email, form.code, form.password);
}

async function sendCode() {
  codeSent.value = await sendCloudCode(form.email);
  if (!codeSent.value) return;
  countdown.value = 60;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => { if (--countdown.value <= 0) clearInterval(countdownTimer); }, 1000);
}

onBeforeUnmount(() => clearInterval(countdownTimer));
</script>

<style lang="scss" scoped>
.loginGate {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--el-bg-color-page);

  .loginCard {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(400px, 100%);
    padding: 32px;
    border-radius: calc(var(--ui-radius) * 2);
    background: var(--el-bg-color);
    box-shadow: var(--el-box-shadow-light);

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;

      .brandLogo {
        width: 40px;
        height: 40px;
        object-fit: contain;

        .dark & {
          filter: invert(1);
        }
      }

      h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
      }
    }

    .el-form {
      display: flex;
      flex-direction: column;

      > .el-button {
        width: 100%;
        margin-left: 0;
      }
    }

    .codeRow {
      display: flex;
      gap: 8px;
      width: 100%;
    }

    .switchMode {
      margin: 12px 0 0;
      color: var(--el-text-color-secondary);
      font-size: 13px;
      text-align: center;
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
