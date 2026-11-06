import { nextTick, onScopeDispose, ref, shallowRef, watch } from "vue";
import { useVueFlow, type GraphNode } from "@vue-flow/core";
import { isNodeOutput, type NodeMediaValue } from "@toonflow/nodes-scaffold/values";
import { useNodeFiles, type WorkspaceFiles } from "@toonflow/nodes-scaffold/workspaceFiles";
import type { MediaPreviewItem } from "./components/mediaPreview.vue";
import { showNodeError } from "./showNodeError";

type CanvasImage = {
  value: NodeMediaValue;
  key: string;
  nodeId: string;
  label: string;
  prompt?: string;
  // 同一节点内的结果顺序，批量结果时间相同或接近时按它排
  order: number;
  // 批量结果共用的排序时间，取这一批里最新的时间，保证同批结果连在一起
  batch?: string;
  time?: number;
  x: number;
  y: number;
};

function pathKey(path: string) {
  return path.replaceAll("\\", "/");
}

function directoryOf(path: string) {
  const key = pathKey(path);
  const index = key.lastIndexOf("/");
  return index > 0 ? key.slice(0, index) : "";
}

function readImage(value: unknown) {
  return isNodeOutput({ dataType: "IMAGE", value }) ? value as NodeMediaValue : undefined;
}

function validTime(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

// 把画布上所有节点的图片输出和批量结果收集起来，按路径去重。起始节点优先占用重复图片，保证起始位置落在被双击的那张。
function collectImages(nodes: GraphNode[], startNodeId: string) {
  const images = new Map<string, CanvasImage>();
  const ordered = [...nodes].sort((left, right) => Number(right.id === startNodeId) - Number(left.id === startNodeId));
  for (const node of ordered) {
    const data = (node.data ?? {}) as { label?: unknown; prompt?: unknown; outputs?: Record<string, unknown>; results?: unknown };
    const label = typeof data.label === "string" && data.label.trim() ? data.label.trim() : "未命名节点";
    const prompt = typeof data.prompt === "string" && data.prompt.trim() ? data.prompt : undefined;
    const base = { nodeId: node.id, label, prompt, x: node.computedPosition.x, y: node.computedPosition.y };
    let order = 0;
    const add = (value: NodeMediaValue, batch?: string) => {
      const key = pathKey(value.url);
      const existing = images.get(key);
      if (existing) {
        existing.time ??= validTime(value.createdAt);
        return;
      }
      images.set(key, { ...base, value, key, order: order++, batch, time: validTime(value.createdAt) });
    };
    if (Array.isArray(data.results)) {
      for (const item of data.results) {
        const value = readImage(item);
        if (value) add(value, `${node.id}\nresults`);
      }
    }
    for (const output of Object.values(data.outputs ?? {})) {
      if (isNodeOutput(output) && output.dataType === "IMAGE") add(output.value);
    }
  }
  return [...images.values()];
}

type FileTimes = Map<string, Promise<Map<string, number>>>;

// 老数据没有 createdAt 时，按所在目录批量 list 读取文件修改时间并缓存；读不到的保持无时间。
async function fillFileTimes(files: WorkspaceFiles, images: CanvasImage[], cache: FileTimes) {
  const missing = images.filter(image => image.time === undefined);
  for (const image of missing) {
    const directory = directoryOf(image.value.url);
    if (cache.has(directory)) continue;
    const times = files.list(directory).then(({ entries }) => new Map(entries.flatMap(entry => {
      const time = validTime(entry.mtimeMs);
      return time ? [[pathKey(entry.path), time] as const] : [];
    })));
    // ACT: 读取失败不缓存，下次打开预览再试；成功的目录在本节点生命周期内复用，新生成的图片自带 createdAt 不依赖缓存。
    times.catch(() => cache.delete(directory));
    cache.set(directory, times);
  }
  await Promise.all(missing.map(async image => {
    image.time = await cache.get(directoryOf(image.value.url))!.then(times => times.get(image.key), () => undefined);
  }));
}

// 排序：有时间的从新到旧，同一批结果用这一批最新的时间并按结果顺序；没有时间的排最后，按画布位置从上到下、从左到右。
function sortImages(images: CanvasImage[]) {
  const batchTimes = new Map<string, number>();
  for (const image of images) {
    if (image.batch && image.time !== undefined) batchTimes.set(image.batch, Math.max(batchTimes.get(image.batch) ?? 0, image.time));
  }
  const sortTime = (image: CanvasImage) => image.time === undefined ? undefined : image.batch ? batchTimes.get(image.batch)! : image.time;
  return images.toSorted((left, right) => {
    const leftTime = sortTime(left);
    const rightTime = sortTime(right);
    if (leftTime !== undefined && rightTime !== undefined) {
      if (leftTime !== rightTime) return rightTime - leftTime;
    } else if (leftTime !== undefined || rightTime !== undefined) {
      return leftTime === undefined ? 1 : -1;
    } else if (left.nodeId !== right.nodeId && (left.y !== right.y || left.x !== right.x)) {
      return left.y - right.y || left.x - right.x;
    }
    if (left.nodeId !== right.nodeId) return left.nodeId < right.nodeId ? -1 : 1;
    return left.order - right.order;
  });
}

// 双击放大时翻看当前画布的全部图片：只读取当前张并预取下一张，关闭预览时释放全部地址。
export function useCanvasImages() {
  const { getNodes, findNode, removeSelectedElements, addSelectedNodes, nodesSelectionActive, setCenter, viewport } = useVueFlow();
  const { getWorkspaceFiles } = useNodeFiles();
  const visible = ref(false);
  const index = ref(0);
  const items = shallowRef<MediaPreviewItem[]>([]);
  let images: CanvasImage[] = [];
  let workspace: WorkspaceFiles | undefined;
  let openToken = 0;
  // 上一次的位置，用来判断翻页方向，预取同方向的相邻一张
  let lastIndex = -1;
  const fileTimes: FileTimes = new Map();
  const loaded = new Map<string, { release(): void }>();

  function setUrl(position: number, url: string) {
    if (!items.value[position] || items.value[position]!.url === url) return;
    items.value = items.value.with(position, { ...items.value[position]!, url });
  }

  function load(position: number) {
    const image = images[position];
    if (!image || !workspace || loaded.has(image.key)) return;
    let released = false;
    let ownedUrl = "";
    const shared = workspace.acquireUrl?.(image.value.url, image.value.mimeType);
    loaded.set(image.key, {
      release() {
        released = true;
        shared?.release();
        if (ownedUrl) URL.revokeObjectURL(ownedUrl);
      },
    });
    const token = openToken;
    const url = shared ? shared.url : workspace.read(image.value.url).then(content => {
      // ACT: 旧宿主没有 acquireUrl 时自行创建地址，释放时一并回收。
      if (released) return "";
      return ownedUrl = URL.createObjectURL(new Blob([content], { type: image.value.mimeType }));
    });
    url.then(value => {
      if (!released && token === openToken && value) setUrl(images.indexOf(image), value);
    }).catch(error => {
      if (released || token !== openToken) return;
      loaded.get(image.key)?.release();
      loaded.delete(image.key);
      if (images[index.value] === image) showNodeError(error, "图片读取失败");
    });
  }

  function releaseAll() {
    loaded.forEach(handle => handle.release());
    loaded.clear();
  }

  watch([visible, index], ([open, current]) => {
    if (!open || !images.length) return;
    const count = images.length;
    const step = lastIndex >= 0 && (current - lastIndex + count) % count === count - 1 ? -1 : 1;
    lastIndex = current;
    const next = (current + step + count) % count;
    const wanted = new Set([images[current]!.key, images[next]!.key]);
    for (const [key, handle] of loaded) {
      if (wanted.has(key)) continue;
      handle.release();
      loaded.delete(key);
      const position = images.findIndex(image => image.key === key);
      if (position >= 0) setUrl(position, "");
    }
    load(current);
    load(next);
  });
  watch(visible, open => {
    if (open) return;
    openToken++;
    lastIndex = -1;
    releaseAll();
    images = [];
    items.value = [];
  });
  onScopeDispose(() => {
    openToken++;
    releaseAll();
  });

  // nodeId 为被双击的节点，url 为起始图片；找不到这张时退回该节点的第一张，再退回列表第一张。
  async function open(nodeId: string, url?: string) {
    const token = ++openToken;
    lastIndex = -1;
    releaseAll();
    try {
      workspace = getWorkspaceFiles();
      const collected = collectImages(getNodes.value, nodeId);
      await fillFileTimes(workspace, collected, fileTimes);
      if (token !== openToken) return;
      images = sortImages(collected);
    } catch (error) {
      if (token === openToken) showNodeError(error, "图片预览打开失败");
      return;
    }
    if (!images.length) return;
    const startKey = url ? pathKey(url) : "";
    items.value = images.map(image => ({
      url: "",
      type: "image" as const,
      name: image.value.url.split(/[\\/]/).at(-1),
      nodeLabel: image.label,
      prompt: image.prompt,
      createdAt: image.time,
      nodeId: image.nodeId,
    }));
    const start = images.findIndex(image => image.key === startKey);
    index.value = Math.max(0, start >= 0 ? start : images.findIndex(image => image.nodeId === nodeId));
    visible.value = true;
  }

  // 关闭预览后把画布居中到图片所在节点并只选中它。
  async function locate(nodeId: string) {
    visible.value = false;
    const target = findNode(nodeId);
    if (!target) return void showNodeError("图片所在节点已不存在", "定位节点失败");
    removeSelectedElements();
    addSelectedNodes([target]);
    nodesSelectionActive.value = false;
    await nextTick();
    const { x, y } = target.computedPosition;
    await setCenter(x + (target.dimensions.width || 320) / 2, y + (target.dimensions.height || 300) / 2, { zoom: viewport.value.zoom, duration: 200 });
  }

  return { visible, index, items, open, locate };
}
