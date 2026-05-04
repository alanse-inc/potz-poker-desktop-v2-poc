/**
 * WebdriverIO + tauri-driver 設定
 *
 * 前提:
 *   1. `cargo install tauri-driver --locked` で tauri-driver をインストール済み
 *   2. `pnpm tauri build --debug` で `src-tauri/target/debug/potz-poker-desktop-v2`
 *      が生成済み（バイナリパスは TAURI_BIN 環境変数で上書き可能）
 *
 * プラットフォーム制約:
 *   - Linux (WebKitGTK + WebKitWebDriver) または
 *     Windows (WebView2 + Microsoft Edge Driver) でのみ動作
 *   - macOS は Tauri 2 時点で公式サポート外（WKWebView WebDriver 制約のため）
 *
 * 実行: `pnpm e2e`
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TAURI_DRIVER_PORT = Number(process.env.TAURI_DRIVER_PORT ?? 4444);
const PROJECT_ROOT = resolve(__dirname, "../..");
const DEFAULT_BIN = resolve(
  PROJECT_ROOT,
  "src-tauri/target/debug/potz-poker-desktop-v2",
);
const TAURI_BIN = process.env.TAURI_BIN ?? DEFAULT_BIN;

let tauriDriverProcess: ChildProcess | null = null;

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": {
        application: TAURI_BIN,
      } as Record<string, string>,
    } as WebdriverIO.Capabilities,
  ],
  hostname: "127.0.0.1",
  port: TAURI_DRIVER_PORT,
  baseUrl: "tauri://localhost",
  logLevel: "info",
  bail: 0,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 120_000,
  },

  onPrepare: () => {
    if (!existsSync(TAURI_BIN)) {
      throw new Error(
        `Tauri binary not found at ${TAURI_BIN}.\n` +
          `Run: pnpm tauri build --debug\n` +
          `Or set TAURI_BIN env var to a valid path.`,
      );
    }
    return new Promise<void>((res, rej) => {
      tauriDriverProcess = spawn("tauri-driver", [
        "--port",
        String(TAURI_DRIVER_PORT),
      ]);
      tauriDriverProcess.once("error", (err) => rej(err));
      tauriDriverProcess.stdout?.on("data", (chunk: Buffer) => {
        process.stdout.write(`[tauri-driver] ${chunk.toString()}`);
      });
      tauriDriverProcess.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(`[tauri-driver] ${chunk.toString()}`);
      });
      // tauri-driver は数百ミリ秒で listen を開始する
      setTimeout(() => res(), 1500);
    });
  },

  onComplete: () => {
    if (tauriDriverProcess && !tauriDriverProcess.killed) {
      tauriDriverProcess.kill("SIGTERM");
    }
  },
};
