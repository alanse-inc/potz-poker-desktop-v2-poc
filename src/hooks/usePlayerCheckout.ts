import { useCallback } from "react";
import { BackendApiError, checkoutPlayer } from "../api/backend";
import { useSession } from "../contexts/session_context";
import { isReservedGuestPlayerId } from "../domain/guest_player";
import { isCheckedInPlayerId } from "../domain/player";
import { trackClientSideError } from "../features/error_tracker";

/**
 * `usePlayerCheckout()` の返却 callback の戻り値。
 * - `skipped`: 呼ぶ条件を満たしていなかった（手動追加プレイヤー、未開始セッション等）
 * - `succeeded`: backend への checkout API が 2xx で完了
 * - `already_checked_out`: backend から 422 PLAYER_NOT_CHECKED_IN が返った。
 *   既に目的の状態（checkout 済み）であり、ローカル削除は冪等的に続行して良い。
 * - `failed`: それ以外の API 失敗（network 障害、5xx、別種の 4xx 等）。
 *   ローカル削除を中止し UX 通知を出すべき。
 */
export type CheckoutOutcome =
  | { _kind: "skipped"; reason: SkipReason }
  | { _kind: "succeeded" }
  | { _kind: "already_checked_out" }
  | { _kind: "failed"; status: number; message: string };

type SkipReason =
  | "not_checked_in_player"
  | "session_not_started"
  | "no_game_session_id";

// backend が PLAYER_NOT_CHECKED_IN 時に返す detail メッセージ。
// 422 で「is not actively checked in to session」が含まれることで識別する。
const PLAYER_NOT_CHECKED_IN_PATTERN = /is not actively checked in to session/i;

/**
 * プレイヤー削除時に backend へチェックアウトを通知するフック（Tauri 版）。
 *
 * Electron 版の `usePlayerCheckout` を Tauri 向けに移植。
 * backend API の呼び出しには `src/api/backend.ts` の `checkoutPlayer` を使用する。
 *
 * 呼び出し条件（全て満たす場合のみ API を発火、満たさない場合は `_kind: "skipped"` を返す）:
 *   - playerId が QR チェックイン由来（hexId16 形式）かつ予約済みゲスト ID でない
 *   - currentSession が存在し status が "started"
 *   - currentGameSessionId が設定済み
 */
export function usePlayerCheckout(): (
  playerId: string,
) => Promise<CheckoutOutcome> {
  const { currentSession, currentGameSessionId } = useSession();

  return useCallback(
    async (playerId: string): Promise<CheckoutOutcome> => {
      // 予約済みゲスト ID は手動追加プレイヤー専用のため backend に checkin していない。
      if (!isCheckedInPlayerId(playerId) || isReservedGuestPlayerId(playerId)) {
        return { _kind: "skipped", reason: "not_checked_in_player" };
      }

      if (!currentSession || currentSession.status !== "started") {
        trackClientSideError(
          "Checked-in player removed but session is not started",
          {
            cause: new Error(
              `sessionStatus=${currentSession?.status ?? "null"}, playerId=${playerId}`,
            ),
          },
        );
        return { _kind: "skipped", reason: "session_not_started" };
      }

      if (!currentGameSessionId) {
        trackClientSideError(
          "gameSessionId が未設定のためチェックアウトをスキップ",
          { cause: new Error("currentGameSessionId is null") },
        );
        return { _kind: "skipped", reason: "no_game_session_id" };
      }

      try {
        await checkoutPlayer({
          gameEventId: currentSession.gameEventId,
          gameSessionId: currentGameSessionId,
          playerId,
        });
        return { _kind: "succeeded" };
      } catch (error) {
        if (error instanceof BackendApiError) {
          // 既に backend で checkout 済み（PLAYER_NOT_CHECKED_IN 422）は冪等的に成功扱い。
          if (
            error.status === 422 &&
            PLAYER_NOT_CHECKED_IN_PATTERN.test(error.detail)
          ) {
            return { _kind: "already_checked_out" };
          }
          trackClientSideError("Failed to checkout player", { cause: error });
          return {
            _kind: "failed",
            status: error.status,
            message: error.detail,
          };
        }
        trackClientSideError("Failed to checkout player", { cause: error });
        const message =
          error instanceof Error ? error.message : "checkout API exception";
        return { _kind: "failed", status: 0, message };
      }
    },
    [currentSession, currentGameSessionId],
  );
}
