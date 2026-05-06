import { err, ok, type Result } from "neverthrow";
import { apiFetch } from "./fetch";

export type SetActiveGameEventError =
  | { kind: "network_error"; message: string }
  | { kind: "server_error"; status: number; message: string };

/**
 * POST /api/game-event/set-active
 *
 * バックエンドに「このゲームイベントがアクティブ」と通知する。
 * Tauri 版ローカルサーバー (localhost:3838) のエンドポイントを呼び出す。
 */
export async function setActiveGameEvent(
  gameEventId: string,
): Promise<Result<void, SetActiveGameEventError>> {
  try {
    const response = await apiFetch("/api/game-event/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameEventId }),
    });
    if (!response.ok) {
      return err({
        kind: "server_error",
        status: response.status,
        message: `POST /api/game-event/set-active failed: HTTP ${response.status}`,
      });
    }
    return ok(undefined);
  } catch (error) {
    return err({
      kind: "network_error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
