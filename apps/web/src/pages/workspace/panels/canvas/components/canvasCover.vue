<template>
  <span ref="element" class="canvasCover" aria-hidden="true">
    <img v-if="coverUrl" :key="coverUrl" :src="coverUrl" alt="" draggable="false" decoding="async" @load="reportLoaded" @error="reportUnavailable" />
    <slot v-else />
  </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { NodeMediaValue } from "@toonflow/nodes-scaffold/values";
import useWorkspaceFiles from "@/lib/workspaceFiles";

const props = defineProps<{ directory: string; candidates: readonly NodeMediaValue[] }>();
const emit = defineEmits<{ loaded: []; unavailable: [] }>();
const element = ref<HTMLElement>();
const visible = ref(false);
const coverUrl = ref("");
let observer: IntersectionObserver | undefined;

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => { visible.value = !!entry?.isIntersecting; });
  if (element.value) observer.observe(element.value);
});
onBeforeUnmount(() => observer?.disconnect());

function reportLoaded(event: Event) {
  if ((event.currentTarget as HTMLImageElement).getAttribute("src") === coverUrl.value) emit("loaded");
}

function reportUnavailable(event: Event) {
  if ((event.currentTarget as HTMLImageElement).getAttribute("src") !== coverUrl.value) return;
  coverUrl.value = "";
  emit("unavailable");
}

/** 复用引用卡片的首帧绘制方式；图片也压为静态小图，不播放视频或动画图片。 */
function createStaticCover(url: string, mimeType: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const media = mimeType.startsWith("video/") ? document.createElement("video") : new Image();
    const readyEvent = media instanceof HTMLVideoElement ? "loadeddata" : "load";
    let settled = false;
    const finish = (image?: string, error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", cancel);
      media.removeEventListener(readyEvent, draw);
      media.removeEventListener("error", fail);
      if (media instanceof HTMLVideoElement) media.pause();
      media.removeAttribute("src");
      if (media instanceof HTMLVideoElement) media.load();
      if (image) resolve(image);
      else reject(error ?? new Error("封面不可用"));
    };
    const cancel = () => finish(undefined, signal.reason);
    const fail = () => finish(undefined, new Error("媒体读取失败"));
    const draw = () => {
      if (signal.aborted) return cancel();
      try {
        const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
        const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
        if (!width || !height) return fail();
        const scale = Math.min(1, 480 / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext("2d");
        if (!context) return fail();
        context.drawImage(media, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/webp", 0.82));
      } catch (error) { finish(undefined, error); }
    };
    if (media instanceof HTMLVideoElement) {
      media.preload = "auto";
      media.muted = true;
      media.playsInline = true;
    } else { media.decoding = "async"; }
    signal.addEventListener("abort", cancel, { once: true });
    media.addEventListener(readyEvent, draw, { once: true });
    media.addEventListener("error", fail, { once: true });
    try { media.src = url; } catch (error) { finish(undefined, error); }
  });
}

async function loadCover(files: ReturnType<typeof useWorkspaceFiles>, candidate: NodeMediaValue, parentSignal: AbortSignal) {
  parentSignal.throwIfAborted();
  const preview = files.acquireUrl(candidate.url, candidate.mimeType);
  const controller = new AbortController();
  const signal = AbortSignal.any([parentSignal, controller.signal]);
  const timer = window.setTimeout(() => controller.abort(new DOMException("读取封面超时", "TimeoutError")), 10000);
  let cancel = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    // acquireUrl 的底层读取由共享缓存持有；离屏或超时立即释放本次引用，迟到的 Blob 会由缓存回收。
    const url = await Promise.race([preview.url, aborted]);
    signal.throwIfAborted();
    return await createStaticCover(url, candidate.mimeType, signal);
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    preview.release();
  }
}

watch([visible, () => props.directory, () => props.candidates], async ([inView, directory, candidates], previous, onCleanup) => {
  if (directory !== previous[1] || candidates !== previous[2]) coverUrl.value = "";
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  // 已生成的小图留在本组件中复用；离屏只中止尚未完成的原文件读取。
  if (!inView || coverUrl.value) return;
  if (!directory || !candidates.length) { emit("unavailable"); return; }
  const files = useWorkspaceFiles(directory);
  // ACT: 每张卡片只在可见时按顺序尝试最多 4 个素材；无服务端缩略图时视频仍需读取原文件 Blob。
  for (const candidate of candidates.slice(0, 4)) {
    try {
      const url = await loadCover(files, candidate, controller.signal);
      if (controller.signal.aborted) return;
      coverUrl.value = url;
      return;
    } catch (error) {
      if (controller.signal.aborted) return;
      // 共享读取不能在这里中止；超时后停止追加请求，保留结构预览。
      if (error instanceof DOMException && error.name === "TimeoutError") break;
    }
  }
  emit("unavailable");
}, { immediate: true, flush: "sync" });
</script>

<style lang="scss" scoped>
.canvasCover {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }
}
</style>
