import { resolve } from "node:path";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwind()],
  // Tauri が要求する固定設定
  // 1. ポートを 1420 に固定（Tauri 側がこれを期待する）
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // src-tauri は Tauri CLI 側で監視
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Tauri 側で minify を制御
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "es2022",
    minify: !process.env.TAURI_ENV_DEBUG ? ("esbuild" as const) : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        telop: resolve(__dirname, "telop.html"),
      },
    },
  },
}));
