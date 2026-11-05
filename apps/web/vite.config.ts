import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "@toonflow/file";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import desktopConfig from "../../electrobun.config.ts";
import postcssConfig from "../../postcss.config.ts";
import { i18nPlugin } from "@toonflow/i18n/vite";

const serverOrigin = `http://127.0.0.1:${process.env.TOONFLOW_SERVER_PORT || 3000}`;
// 图片节点 AI 超分的推理运行时：WebGPU 包与它加载的 wasm 放在 superResolution/ 下，和 public 里的模型同目录。
const ortDirectory = fileURLToPath(new URL("./node_modules/onnxruntime-web/dist/", import.meta.url));
const ortFiles = ["ort.webgpu.bundle.min.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];

function superResolutionRuntime(): Plugin {
  return {
    name: "superResolutionRuntime",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split("?")[0].replace("/superResolution/", "");
        if (!name || !ortFiles.includes(name) || !request.url?.startsWith("/superResolution/")) return next();
        response.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        response.end(readFileSync(resolve(ortDirectory, name)));
      });
    },
    generateBundle() {
      for (const name of ortFiles) this.emitFile({ type: "asset", fileName: `superResolution/${name}`, source: readFileSync(resolve(ortDirectory, name)) });
    },
  };
}

export default defineConfig({
  css: { postcss: postcssConfig },
  define: {
    "import.meta.env.appVersion": JSON.stringify(desktopConfig.app.version),
  },
  server: {
    proxy: {
      "/mcp": { target: serverOrigin, changeOrigin: false },
      "/a2a": { target: serverOrigin, changeOrigin: false },
      "/api": {
        target: serverOrigin,
        changeOrigin: false,
        configure(proxy) {
          proxy.on("proxyReq", (request, incoming) => {
            request.setHeader("x-toonflow-local-client", ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(incoming.socket.remoteAddress ?? "") ? "1" : "0");
          });
        },
      },
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      { find: /^shiki$/, replacement: fileURLToPath(new URL("./src/lib/shiki.ts", import.meta.url)) },
    ],
  },
  build: {
    outDir: "../../build/web",
    emptyOutDir: true,
  },
  plugins: [
    i18nPlugin(),
    superResolutionRuntime(),
    vue(),
    components({
      globsExclude: ["src/components/settings/panels/**/*Dialog.vue"],
      dts: "src/types/components.d.ts",
      resolvers: [
        ElementPlusResolver(),
        (name) => {
          if (name.startsWith("Icon")) return { name, from: "@tabler/icons-vue" };
        },
      ],
    }),
  ],
});
