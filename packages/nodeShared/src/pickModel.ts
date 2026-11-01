import { ElMessage } from "element-plus";

type ModelItem = { providerId: string; modelId: string; label: string; isDefault?: boolean };

// ACT: 独立 UMD 各有模块作用域，提示记录挂在宿主全局，同一个失效模型在本次运行中只提示一次。
const warnedKey = Symbol.for("toonflow.modelFallbackWarned");
const warnedHost = globalThis as typeof globalThis & { [warnedKey]?: Set<string> };
const warned = warnedHost[warnedKey] ??= new Set<string>();

const modelKey = (item: ModelItem) => JSON.stringify([item.providerId, item.modelId]);

// 返回应选中的模型键：已保存且可用的保留（旧供应商 ID 按模型 ID 匹配）；没有保存时取设置里的默认模型，再取第一项；
// 已保存但不可用时回退第一项并提示。模型列表为空（未登录或读取失败）时保持原值。
export function pickModel(models: readonly ModelItem[], saved: string) {
  const first = models[0];
  if (!first) return saved;
  if (!saved) return modelKey(models.find(item => item.isDefault) ?? first);
  if (models.some(item => modelKey(item) === saved)) return saved;
  const modelId = (() => { try { return (JSON.parse(saved) as unknown[])[1]; } catch { return undefined; } })();
  const match = models.find(item => item.modelId === modelId);
  if (match) return modelKey(match);
  if (!warned.has(saved)) {
    warned.add(saved);
    ElMessage.warning(`所选模型${typeof modelId === "string" ? `「${modelId}」` : ""}已不可用，已切换为「${first.label}」`);
  }
  return modelKey(first);
}
