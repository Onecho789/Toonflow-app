import { h } from "vue";
import { ElNotification } from "element-plus";
import nodeError from "./components/nodeError.vue";

// 报错提示 6 秒后自动关闭；鼠标悬停或键盘焦点在提示内时暂停计时，开始 AI 解释后不再自动关闭。
const autoCloseDelay = 6000;

export function showNodeError(error: unknown, title: string) {
  if (error instanceof Error && error.name === "AbortError") return;
  const detail = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  const message = typeof detail === "string" && detail.trim() ? detail
    : error instanceof Error ? error.message : typeof error === "string" ? error : title;
  const controller = new AbortController();
  const id = `nodeError${crypto.randomUUID()}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pinned = false;
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const start = () => {
    stop();
    if (!pinned && !controller.signal.aborted) timer = setTimeout(() => notification.close(), autoCloseDelay);
  };
  // ACT: 自己计时而不用 duration：模型下拉框挂在提示外部，原生的移出即重计时会在选模型时把提示关掉。
  const notification = ElNotification({
    title,
    type: "error",
    duration: 0,
    customClass: `nodeErrorNotification ${id}`,
    message: h(nodeError, { message: message || title, context: title, signal: controller.signal, onPin: () => { pinned = true; stop(); } }),
    onClose: () => {
      stop();
      controller.abort();
    },
  });
  const element = document.querySelector<HTMLElement>(`.${id}`);
  if (element) {
    const hovering = () => element.matches(":hover") || element.contains(document.activeElement);
    element.addEventListener("mouseenter", stop, { signal: controller.signal });
    element.addEventListener("focusin", stop, { signal: controller.signal });
    element.addEventListener("mouseleave", () => { if (!hovering()) start(); }, { signal: controller.signal });
    element.addEventListener("focusout", () => setTimeout(() => { if (!hovering()) start(); }), { signal: controller.signal });
  }
  start();
}
