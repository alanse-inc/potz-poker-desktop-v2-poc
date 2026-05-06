import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";

export type UpdaterState =
  | { phase: "idle" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; progress: number }
  | { phase: "ready" }
  | { phase: "error"; message: string };

/**
 * Tauri plugin-updater を使ったアプリ自動更新フック。
 *
 * - アプリ起動時にバックグラウンドで更新チェックを実行する。
 * - 新バージョンが見つかれば state を "available" に遷移させる。
 * - `startUpdate()` を呼ぶとダウンロード → インストール → 再起動する。
 *
 * NOTE: tauri.conf.json の `plugins.updater.active` が false の間は
 *       check() が常に null を返すため、本フックは idle のまま。
 *       実運用時は active: true に変更し pubkey を設定すること。
 */
export function useAppUpdater() {
  const [state, setState] = useState<UpdaterState>({ phase: "idle" });
  // Started イベントで得られる contentLength を保持する
  const contentLengthRef = useRef<number>(0);
  const downloadedRef = useRef<number>(0);
  const unmountedRef = useRef(false);

  const checkForUpdates = useCallback(async () => {
    // dev 環境では updater endpoints がプレースホルダー (example.com) のため
    // HTTP リクエストが必ず失敗してログにエラーが出る。実運用ビルドのみで実行する。
    if (import.meta.env.DEV) return;
    try {
      const update = await check();
      if (unmountedRef.current) return;
      if (update?.available) {
        setState({ phase: "available", version: update.version });
      }
    } catch (error) {
      // updater が無効 (active: false) の場合も含め、エラーは静かに握り潰す。
      // 実運用では Sentry 等に送信することを推奨。
      console.error("[useAppUpdater] update check failed:", error);
    }
  }, []);

  const startUpdate = useCallback(async () => {
    if (import.meta.env.DEV) return;
    try {
      const update = await check();
      if (!update?.available) return;

      contentLengthRef.current = 0;
      downloadedRef.current = 0;

      await update.downloadAndInstall((event) => {
        if (unmountedRef.current) return;
        switch (event.event) {
          case "Started":
            contentLengthRef.current = event.data.contentLength ?? 0;
            setState({ phase: "downloading", progress: 0 });
            break;
          case "Progress": {
            downloadedRef.current += event.data.chunkLength;
            const total = contentLengthRef.current;
            const progress =
              total > 0
                ? Math.min(
                    100,
                    Math.round((downloadedRef.current / total) * 100),
                  )
                : 0;
            setState({ phase: "downloading", progress });
            break;
          }
          case "Finished":
            setState({ phase: "ready" });
            break;
          default:
            break;
        }
      });

      // downloadAndInstall が完了したらアプリを再起動
      await relaunch();
    } catch (error) {
      console.error("[useAppUpdater] update failed:", error);
      if (unmountedRef.current) return;
      setState({ phase: "error", message: String(error) });
    }
  }, []);

  const dismiss = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  useEffect(() => {
    checkForUpdates();
    return () => {
      unmountedRef.current = true;
    };
  }, [checkForUpdates]);

  return { state, startUpdate, dismiss };
}
