import { useCallback } from "react";
import { useNavigate } from "react-router";

/**
 * ルート変更をウィンドウ間で同期するナビゲーションフック（Tauri 版）
 *
 * @remarks
 * Electron 版では window.route.setRoute() による IPC 同期を行っていたが、
 * Tauri 版ではまだ同等の仕組みが未実装のため、skipSync フラグは受け付けるが
 * 外部同期処理は no-op になっている。
 */
export function useSyncedNavigate() {
  const navigate = useNavigate();

  const syncedNavigate = useCallback(
    (to: string, options?: { skipSync?: boolean; state?: unknown }) => {
      // ローカルナビゲーションを実行
      navigate(
        to,
        options?.state !== undefined ? { state: options.state } : undefined,
      );

      if (options?.skipSync) {
        return;
      }

      // TODO: Tauri のマルチウィンドウ間ルート同期（現在 no-op）
      // Tauri event emit/listen を使って telop ウィンドウへ通知する予定
    },
    [navigate],
  );

  return syncedNavigate;
}
