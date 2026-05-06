import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import type {
  GameEventDetailResponse,
  GameSessionResponse,
} from "../api/backend";
import { BackendApiError, getGameEventDetail } from "../api/backend";
import { setActiveGameEvent } from "../api/backend_game_event";
import { useOperator } from "../contexts/operator_context";
import { useSession } from "../contexts/session_context";
import { trackClientSideError } from "../features/error_tracker";
import { usePreferences } from "./usePreferences";

/**
 * preferences.lastSelectedSessionId からゲームイベントを取得し、
 * currentSession / currentGameSessionId / lastHandNumber を初期化する（Tauri 版）。
 *
 * Electron 版の `useRestoreSessionFromPreferences` を Tauri 向けに移植。
 * - `fetchGameEvent` → `getGameEventDetail` に置き換え
 * - `setActiveGameEvent` で /api/game-event/set-active を呼び出し、
 *   バックエンドに「このゲームイベントがアクティブ」と通知する。
 *   API 失敗時はローカルセッション復元を続行し、toast でエラーを通知する。
 * - `fromGameEventResponse` はここでは使わず、`GameEventDetailResponse` を
 *   `GameSessionResponse` として直接 setCurrentSession に渡す設計に簡略化
 *
 * 設定画面へ直接遷移した場合でも CheckIn API 等に必要なコンテキストを揃える。
 */
export function useRestoreSessionFromPreferences(logLabel: string): void {
  const {
    currentGameSessionId,
    setCurrentSession,
    setCurrentGameSessionId,
    setLastHandNumber,
  } = useSession();
  const { preferences, isLoaded: isPreferencesLoaded } = usePreferences();
  const { gameTable } = useOperator();

  const sessionInitializedRef = useRef(false);

  useEffect(() => {
    const logPrefix = `[${logLabel}]`;

    if (!isPreferencesLoaded) return;
    if (!preferences.lastSelectedSessionId) return;
    if (currentGameSessionId) return;
    if (sessionInitializedRef.current) return;
    sessionInitializedRef.current = true;

    void (async () => {
      const sessionId = preferences.lastSelectedSessionId as string;
      try {
        let gameEventData: GameEventDetailResponse;
        try {
          gameEventData = await getGameEventDetail(sessionId);
        } catch (error) {
          const status = error instanceof BackendApiError ? error.status : 0;
          const message =
            error instanceof BackendApiError
              ? error.detail
              : error instanceof Error
                ? error.message
                : "getGameEventDetail failed";
          trackClientSideError(
            `${logPrefix} getGameEventDetail failed: ${message} (${status})`,
          );
          sessionInitializedRef.current = false;
          return;
        }

        // セッションを特定する: gameTable がある場合はテーブル ID で絞り込み
        const resolvedSession:
          | (GameSessionResponse & { players: unknown[] })
          | undefined =
          gameTable != null
            ? (gameEventData.sessions.find(
                (s) => s.gameTableId === gameTable.tableId,
              ) ??
              gameEventData.sessions.find((s) => s.status === "started") ??
              gameEventData.sessions[0])
            : (gameEventData.sessions.find((s) => s.status === "started") ??
              gameEventData.sessions[0]);

        const resolvedSessionId = resolvedSession?.gameSessionId;

        // オペレーター UI では pending でも "started" とみなす
        const sessionForContext: GameSessionResponse = {
          gameSessionId: resolvedSession?.gameSessionId ?? "",
          gameEventId: sessionId,
          gameTableId: gameEventData.gameTableId,
          status: "started",
          currentHandNumber: resolvedSession?.currentHandNumber ?? 0,
          startedAt: resolvedSession?.startedAt ?? null,
          finishedAt: resolvedSession?.finishedAt ?? null,
          gameName: resolvedSession?.gameName ?? gameEventData.gameName ?? null,
          texasHoldemSetting: resolvedSession?.texasHoldemSetting ?? null,
        };

        if (!resolvedSessionId) {
          setCurrentSession(sessionForContext);
          return;
        }

        setCurrentGameSessionId(resolvedSessionId);
        setCurrentSession(sessionForContext);
        setLastHandNumber(resolvedSession?.currentHandNumber ?? 0);

        // バックエンドに「このゲームイベントがアクティブ」と通知する
        const setActiveResult = await setActiveGameEvent(sessionId);
        if (setActiveResult.isErr()) {
          trackClientSideError(
            `${logPrefix} Failed to set active game event: ${setActiveResult.error.message}`,
          );
          toast.error("セッション復元時のアクティブ通知に失敗しました");
        }
      } catch (error) {
        sessionInitializedRef.current = false;
        trackClientSideError(
          `${logPrefix} Failed to initialize session context`,
          { cause: error },
        );
      }
    })();
  }, [
    logLabel,
    isPreferencesLoaded,
    preferences.lastSelectedSessionId,
    currentGameSessionId,
    gameTable,
    setCurrentSession,
    setCurrentGameSessionId,
    setLastHandNumber,
  ]);
}
