import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import { useNode } from "@vue-flow/core";
import { nodeTools, z } from "@toonflow/nodes-scaffold/nodeTools";
import type { NodeOutputs } from "@toonflow/nodes-scaffold/values";

// 写入 node.data.generationTask 的可恢复任务：进行中带 taskId，失败后带 error，保留原请求供重试。
export type NodeGenerationTask<R = Record<string, unknown>> = {
  // 记录所属节点；复制出的节点带着别人的任务时不恢复。
  nodeId: string;
  taskId?: string;
  mediaType: "image" | "video";
  startedAt: number;
  request: R;
  error?: string;
};

export function useNodeGeneration(outputs: Readonly<Ref<NodeOutputs>>, cancel: () => void) {
  const status = ref<"idle" | "running" | "succeeded" | "failed">("idle");
  const error = ref("");
  const generating = computed(() => status.value === "running");
  const retryHandler = shallowRef<() => unknown>();
  const canRetry = computed(() => status.value === "failed" && !!retryHandler.value);
  const { node } = useNode();
  let disposed = false;
  onScopeDispose(() => { disposed = true; });
  // 写入 node.data 供画布侧栏显示状态点；历史只记录 label，保存时宿主会去掉 running。
  // 新实例尚未生成时，残留的 running（例如来自复制的节点）视为无状态。
  if (node.data.generationStatus === "running") delete node.data.generationStatus;
  // 挂载时读到的任务：有 taskId 的由节点继续领取，有 error 的显示失败并允许重试。
  let savedTask = node.data.generationTask as NodeGenerationTask | undefined;
  if (savedTask && savedTask.nodeId !== node.id) {
    delete node.data.generationTask;
    savedTask = undefined;
  }
  if (savedTask?.error) {
    status.value = "failed";
    error.value = savedTask.error;
  }
  watch(status, value => {
    if (value === "idle") delete node.data.generationStatus;
    else node.data.generationStatus = value;
  });
  const getStatus = () => ({ status: status.value, outputs: outputs.value, ...(error.value ? { error: error.value } : {}) });

  nodeTools.register({
    name: "getGenerationStatus",
    description: "查询本次打开节点后的生成状态（idle/running/succeeded/failed）、当前输出和最近一次生成错误。当前输出可能来自之前的生成；idle 不表示没有历史输出，只有 succeeded 表示本次生成成功",
    parameters: z.strictObject({}),
    execute: getStatus,
  });
  nodeTools.register({
    name: "cancelGeneration",
    description: "请求停止当前后台生成；cancellationRequested 表示已发出停止请求，随后用 getGenerationStatus 查询终止状态。不会删除已有输出，不能保证供应商撤销任务或费用",
    parameters: z.strictObject({}),
    execute() {
      const cancellationRequested = generating.value;
      if (cancellationRequested) cancel();
      return { ...getStatus(), cancellationRequested };
    },
  });

  nodeTools.register({
    name: "retryGeneration",
    description: "生成失败后用失败那次的原请求参数重新生成；只在 getGenerationStatus 为 failed 时可用，立即返回已开始，用 getGenerationStatus 查询完成结果",
    parameters: z.strictObject({}),
    async execute() {
      if (!canRetry.value) throw new Error(generating.value ? "节点正在生成，请等待完成" : "当前没有可重试的失败生成");
      await retryHandler.value!();
      return getStatus();
    },
  });

  // 记录可恢复任务，应在拿到任务编号后、等待结果前调用；不传参数时清除旧记录。
  function track(task?: NodeGenerationTask) {
    if (task) node.data.generationTask = task;
    else delete node.data.generationTask;
  }

  function setRetry(handler: (() => unknown) | undefined) {
    retryHandler.value = handler;
  }

  // 失败状态下用原请求参数重新发起；生成中或没有可重试的请求时忽略。
  function retry() {
    if (!canRetry.value) return;
    return retryHandler.value!();
  }

  // retry 给出时，失败后可用 retry() 以同样参数重新生成；不给则沿用上一次的重试方式。
  async function run<T>(task: () => Promise<T>, retryWith?: () => unknown): Promise<T> {
    if (generating.value) throw new Error("节点正在生成，请等待完成");
    if (retryWith) retryHandler.value = retryWith;
    status.value = "running";
    error.value = "";
    try {
      const result = await task();
      status.value = "succeeded";
      delete node.data.generationTask;
      return result;
    } catch (failure) {
      const aborted = failure instanceof Error && failure.name === "AbortError";
      // 节点卸载（关闭画布、重启）时任务仍在服务端运行，保留记录，下次打开继续领取。
      if (disposed && aborted) throw failure;
      status.value = "failed";
      const message = (failure as { response?: { data?: { message?: string } } })?.response?.data?.message;
      error.value = aborted ? "生成已取消"
        : message || (failure instanceof Error ? failure.message : "生成失败");
      const tracked = node.data.generationTask as NodeGenerationTask | undefined;
      if (aborted || !tracked) delete node.data.generationTask;
      else node.data.generationTask = { ...tracked, taskId: undefined, error: error.value };
      throw failure;
    }
  }

  return { generating, status, error, canRetry, savedTask, run, retry, setRetry, track };
}
