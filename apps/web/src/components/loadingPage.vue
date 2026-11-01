<template>
  <teleport to="body">
    <div v-if="visible" class="loadingPage" :class="{ leaving }" role="status" aria-label="正在加载项目" @animationend="finishLeaving">
      <div class="logoWrap" :class="{ drawn }" aria-hidden="true">
        <span class="logoGlow" />
        <img class="logoImage" :src="logoUrl" alt="" @animationend="finishEntering" />
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import logoUrl from "@toonflow/assets/logo.png";

const props = defineProps<{ active: boolean }>();
const visible = defineModel<boolean>("visible", { default: false });
const drawn = defineModel<boolean>("drawn", { default: false });
const leaving = ref(false);
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const reducedMotion = ref(motionPreference.matches);

function updateMotionPreference(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches;
}
motionPreference.addEventListener("change", updateMotionPreference);
onBeforeUnmount(() => motionPreference.removeEventListener("change", updateMotionPreference));

watch([() => props.active, reducedMotion], ([active, reducedMotion]) => {
  if (active) {
    if (!visible.value) {
      drawn.value = false;
      visible.value = true;
    }
    leaving.value = false;
  }
  if (reducedMotion) {
    drawn.value = true;
    if (!active) visible.value = false;
  } else if (!active && drawn.value && visible.value) {
    leaving.value = true;
  }
}, { immediate: true });

// 入场动画结束后才允许页面切换，与原描边结束的时机一致。
function finishEntering() {
  if (drawn.value) return;
  drawn.value = true;
  if (!props.active) leaving.value = true;
}

function finishLeaving(event: AnimationEvent) {
  if (event.target === event.currentTarget && !props.active) visible.value = false;
}
</script>

<style lang="scss" scoped>
.loadingPage {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: var(--el-bg-color);

  &.leaving { animation: pageLeave 0.3s ease both; }

  .logoWrap {
    position: absolute;
    top: 50dvh;
    left: 50vw;
    width: 112px;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);

    .logoGlow {
      position: absolute;
      inset: -45%;
      border-radius: 50%;
      background: radial-gradient(circle, rgb(245 183 49 / 45%) 0%, rgb(242 140 40 / 18%) 42%, transparent 70%);
      animation: glowEnter 0.6s ease both;
    }

    .logoImage {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      animation: logoEnter 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }

    &.drawn {
      .logoGlow { animation: glowBreathe 1.6s ease-in-out infinite; }
      .logoImage { animation: logoBreathe 1.6s ease-in-out infinite; }
    }

    @media (prefers-reduced-motion: reduce) {
      .logoGlow, .logoImage, &.drawn .logoGlow, &.drawn .logoImage { animation: none; }
    }
  }
}

@keyframes logoEnter {
  from { opacity: 0; transform: scale(0.82); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes glowEnter {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes logoBreathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

@keyframes glowBreathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(1.12); }
}

@keyframes pageLeave {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
