import type * as ortTypes from "onnxruntime-web/webgpu";

type Ort = typeof ortTypes;
type Runtime = { ort: Ort; session: ortTypes.InferenceSession; backend: "webgpu" | "wasm" };

// 运行时与模型随宿主网页静态资源发布（apps/web 构建时复制到 superResolution/），插件单文件不携带 wasm。
const assetBase = () => new URL("/superResolution/", location.href).href;
// Real-ESRGAN 建议：256 像素分块、16 像素重叠，接缝不可见且显存占用小。
const tileSize = 256;
const tilePadding = 16;
const modelScale = 4;
// 输出画布上限，避免超出 Chromium 画布尺寸或内存。
export const superResolveMaxEdge = 8192;

let runtime: Promise<Runtime> | undefined;

async function createRuntime(preferGpu: boolean): Promise<Runtime> {
  const base = assetBase();
  const ort = await import(/* @vite-ignore */ `${base}ort.webgpu.bundle.min.mjs`) as Ort;
  // 只改 wasm 地址；胶水代码已内嵌在 bundle 中，给目录前缀会让它另去请求 .mjs。
  ort.env.wasm.wasmPaths = { wasm: `${base}ort-wasm-simd-threaded.asyncify.wasm` };
  // 页面未跨源隔离时 wasm 只能单线程。
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  if (preferGpu && "gpu" in navigator) {
    try {
      const session = await ort.InferenceSession.create(`${base}realesrGeneralX4v3Fp16.onnx`, { executionProviders: ["webgpu"] });
      return { ort, session, backend: "webgpu" };
    } catch (error) {
      console.warn("WebGPU 超分不可用，改用 CPU", error);
    }
  }
  const session = await ort.InferenceSession.create(`${base}realesrGeneralX4v3.onnx`, { executionProviders: ["wasm"] });
  return { ort, session, backend: "wasm" };
}

function loadRuntime(preferGpu = true) {
  runtime ??= createRuntime(preferGpu).catch(error => {
    runtime = undefined;
    throw error;
  });
  return runtime;
}

export type SuperResolveProgress = { done: number; total: number; backend: Runtime["backend"] };

// 分块推理：每块向四周多取 tilePadding 像素喂给模型，只把中间部分按目标倍率画回输出画布；透明图最后按原图 alpha 裁出。
export async function superResolve(image: HTMLImageElement, scale: 2 | 4, signal: AbortSignal, onProgress: (progress: SuperResolveProgress) => void) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (Math.max(width, height) * scale > superResolveMaxEdge) throw new Error(`输出长边不能超过 ${superResolveMaxEdge} 像素`);
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("无法创建图片画布");
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, width, height).data;
  source.width = source.height = 0;
  let hasAlpha = false;
  for (let index = 3; index < pixels.length && !hasAlpha; index += 4) hasAlpha = pixels[index] < 255;

  const output = document.createElement("canvas");
  output.width = width * scale;
  output.height = height * scale;
  const outputContext = output.getContext("2d");
  const tile = document.createElement("canvas");
  const tileContext = tile.getContext("2d");
  if (!outputContext || !tileContext) throw new Error("无法创建图片画布");
  outputContext.imageSmoothingQuality = "high";

  const tiles: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) tiles.push({ x, y, w: Math.min(tileSize, width - x), h: Math.min(tileSize, height - y) });
  }
  let current = await loadRuntime();
  signal.throwIfAborted();
  try {
    for (const [index, item] of tiles.entries()) {
      signal.throwIfAborted();
      onProgress({ done: index, total: tiles.length, backend: current.backend });
      // 让出主线程，进度条和取消按钮能及时响应。
      await new Promise(resolve => setTimeout(resolve));
      const left = Math.max(0, item.x - tilePadding);
      const top = Math.max(0, item.y - tilePadding);
      const right = Math.min(width, item.x + item.w + tilePadding);
      const bottom = Math.min(height, item.y + item.h + tilePadding);
      const inputWidth = right - left;
      const inputHeight = bottom - top;
      const plane = inputWidth * inputHeight;
      const input = new Float32Array(plane * 3);
      for (let row = 0; row < inputHeight; row++) {
        for (let column = 0; column < inputWidth; column++) {
          const from = ((top + row) * width + left + column) * 4;
          const to = row * inputWidth + column;
          input[to] = pixels[from] / 255;
          input[to + plane] = pixels[from + 1] / 255;
          input[to + plane * 2] = pixels[from + 2] / 255;
        }
      }
      let result: ortTypes.Tensor;
      try {
        result = await runTile(current, input, inputWidth, inputHeight);
      } catch (error) {
        // WebGPU 会话能建立但推理失败（驱动或显存问题）时整体改用 CPU 重来一次。
        if (current.backend !== "webgpu") throw error;
        console.warn("WebGPU 超分推理失败，改用 CPU", error);
        runtime = undefined;
        current = await loadRuntime(false);
        result = await runTile(current, input, inputWidth, inputHeight);
      }
      const outWidth = inputWidth * modelScale;
      const outHeight = inputHeight * modelScale;
      const outPlane = outWidth * outHeight;
      const values = result.data as Float32Array;
      const rgba = new ImageData(outWidth, outHeight);
      for (let offset = 0; offset < outPlane; offset++) {
        rgba.data[offset * 4] = values[offset] * 255;
        rgba.data[offset * 4 + 1] = values[offset + outPlane] * 255;
        rgba.data[offset * 4 + 2] = values[offset + outPlane * 2] * 255;
        rgba.data[offset * 4 + 3] = 255;
      }
      result.dispose();
      tile.width = outWidth;
      tile.height = outHeight;
      tileContext.putImageData(rgba, 0, 0);
      outputContext.drawImage(
        tile,
        (item.x - left) * modelScale, (item.y - top) * modelScale, item.w * modelScale, item.h * modelScale,
        item.x * scale, item.y * scale, item.w * scale, item.h * scale,
      );
    }
    if (hasAlpha) {
      outputContext.globalCompositeOperation = "destination-in";
      outputContext.drawImage(image, 0, 0, output.width, output.height);
      outputContext.globalCompositeOperation = "source-over";
    }
    onProgress({ done: tiles.length, total: tiles.length, backend: current.backend });
    return output;
  } catch (error) {
    output.width = output.height = 0;
    throw error;
  } finally {
    tile.width = tile.height = 0;
  }
}

async function runTile({ ort, session }: Runtime, data: Float32Array, width: number, height: number) {
  const input = new ort.Tensor("float32", data, [1, 3, height, width]);
  try {
    const { output } = await session.run({ input });
    return output;
  } finally {
    input.dispose();
  }
}
