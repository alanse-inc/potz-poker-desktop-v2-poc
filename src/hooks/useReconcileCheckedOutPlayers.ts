import { useEffect } from "react";
import type { GameSessionPlayerResponse } from "../api/backend";
import { BackendApiError, getGameEventDetail } from "../api/backend";
import { useSession } from "../contexts/session_context";
import { isReservedGuestPlayerId } from "../domain/guest_player";
import { isCheckedInPlayerId } from "../domain/player";
import { trackClientSideError } from "../features/error_tracker";
import { useRemovePlayerFromGameSettings } from "./useRemovePlayerFromGameSettings";

/**
 * Module-scope のセット。複数の component instance でも同じ session に対して
 * reconciliation を 2 回走らせないため、インスタンス境界を超えた重複ガードを担う。
 *
 * 失敗時はキーが Set から取り除かれ、次回 mount 時に再試行される。
 */
const reconciledSessionKeys = new Set<string>();

const buildReconciliationKey = (
  gameEventId: string,
  gameSessionId: string,
): string => JSON.stringify([gameEventId, gameSessionId]);

/** fetchGameSessionDetail の結果型 */
type GameSessionDetailResult =
  | {
      ok: true;
      data: {
        players: GameSessionPlayerResponse[];
      };
    }
  | { ok: false; status: number; message: string };

/**
 * gameEventId + gameSessionId で backend からセッション詳細を取得する。
 * Tauri 版では `getGameEventDetail` を利用してセッションを絞り込む。
 */
async function fetchGameSessionDetail(
  gameEventId: string,
  gameSessionId: string,
): Promise<GameSessionDetailResult> {
  try {
    const detail = await getGameEventDetail(gameEventId);
    const session = detail.sessions.find(
      (s) => s.gameSessionId === gameSessionId,
    );
    if (!session) {
      return {
        ok: false,
        status: 404,
        message: `gameSessionId ${gameSessionId} not found in gameEvent ${gameEventId}`,
      };
    }
    return { ok: true, data: { players: session.players } };
  } catch (error) {
    // BackendApiError（4xx/5xx）は { ok: false } に変換して呼び出し側で観測。
    // instanceof チェックはモック環境で同一クラスにならないため name で判定する。
    if (
      error instanceof BackendApiError ||
      (error instanceof Error && error.name === "BackendApiError")
    ) {
      const apiError = error as BackendApiError;
      return { ok: false, status: apiError.status, message: apiError.detail };
    }
    // network エラーや予期せぬ例外は再 throw して外側の catch で「unexpected error」として処理
    throw error;
  }
}

/**
 * 起動 / セッション復元時に backend の active players とローカル永続ストア (game-settings) を
 * 突き合わせ、backend で既に checkout 済み（`finishedHandNumber !== null` または
 * `checkedOutAt !== null`）なのにローカルに残っている「ゾンビプレイヤー」を補正する（Tauri 版）。
 *
 * 動作タイミング:
 *   - `currentSession` と `currentGameSessionId` の両方が設定されており、`status === "started"` のとき
 *   - 同じ (gameEventId, gameSessionId) 組に対しては module-scope Set で 1 回だけ実行
 *   - fetch 失敗時は Set から取り除かれ、次回マウントで再試行される
 */
export function useReconcileCheckedOutPlayers(): void {
  const { currentSession, currentGameSessionId } = useSession();
  const removePlayerFromGameSettings = useRemovePlayerFromGameSettings();

  useEffect(() => {
    if (
      !currentSession ||
      currentSession.status !== "started" ||
      !currentGameSessionId
    ) {
      return;
    }
    const reconciliationKey = buildReconciliationKey(
      currentSession.gameEventId,
      currentGameSessionId,
    );
    if (reconciledSessionKeys.has(reconciliationKey)) {
      return;
    }
    reconciledSessionKeys.add(reconciliationKey);

    const abortController = new AbortController();

    (async () => {
      try {
        const result = await fetchGameSessionDetail(
          currentSession.gameEventId,
          currentGameSessionId,
        );
        if (abortController.signal.aborted) {
          // unmount による abort の場合はキーを削除し、次回マウント時に再試行できるようにする
          reconciledSessionKeys.delete(reconciliationKey);
          return;
        }

        if (!result.ok) {
          reconciledSessionKeys.delete(reconciliationKey);
          trackClientSideError(
            "Reconciliation: failed to fetch session detail",
            { cause: new Error(`[${result.status}] ${result.message}`) },
          );
          return;
        }

        const checkedOutPlayerIds = result.data.players
          .filter(
            (p) => p.finishedHandNumber !== null || p.checkedOutAt !== null,
          )
          .map((p) => p.playerId)
          .filter(
            (id) => isCheckedInPlayerId(id) && !isReservedGuestPlayerId(id),
          );

        if (abortController.signal.aborted) {
          reconciledSessionKeys.delete(reconciliationKey);
          return;
        }

        await Promise.all(
          checkedOutPlayerIds.map((playerId) =>
            removePlayerFromGameSettings(playerId),
          ),
        );
      } catch (error) {
        reconciledSessionKeys.delete(reconciliationKey);
        trackClientSideError("Reconciliation: unexpected error", {
          cause: error,
        });
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [currentSession, currentGameSessionId, removePlayerFromGameSettings]);
}

/**
 * テスト用に reconciliation 状態をリセットする。テスト以外では使用しない。
 */
export const __resetReconciliationStateForTesting = (): void => {
  reconciledSessionKeys.clear();
};
