/**
 * apiFetch - Tauri 版ローカル API 呼び出し用 fetch ラッパー
 *
 * Electron 版の `apiFetch` に相当する。
 * Tauri 版ではローカル Hono サーバー (http://localhost:3838) に向ける。
 */

const BASE_URL = "http://localhost:3838";

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (/^https?:\/\//i.test(path)) {
    return fetch(path, init);
  }

  if (!path.startsWith("/")) {
    throw new Error(
      `apiFetch expects an absolute path starting with "/": received "${path}"`,
    );
  }

  return fetch(`${BASE_URL}${path}`, init);
}
