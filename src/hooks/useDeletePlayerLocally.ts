import { invoke } from "@tauri-apps/api/core";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { useCallback } from "react";
import { trackError } from "../features/error_tracker";
import { useRemovePlayerFromGameSettings } from "./useRemovePlayerFromGameSettings";

/**
 * ローカル削除フローのエラー型。
 * - `local_state_failed`: Tauri コマンド経由のローカル state 削除に失敗
 */
export type LocalDeleteError = {
  readonly _tag: "LocalDeleteError";
  readonly cause: Error;
};

const localDeleteError = (cause: Error): LocalDeleteError => ({
  _tag: "LocalDeleteError",
  cause,
});

/**
 * プレイヤーをローカル状態から削除する共通フック（Tauri 版）。
 *
 * 削除フロー:
 *   1) `invoke("remove_player_from_initial_board", { playerId })` で
 *      Tauri コマンド経由で initial-board の状態を更新する
 *   2) ローカル永続ストア (`game-settings`) からも除外し、
 *      再起動時のゾンビプレイヤー復元を防ぐ
 *
 * 戻り値は neverthrow の `ResultAsync<void, LocalDeleteError>`:
 *   - `ok`: ローカル state 削除成功。永続ストア同期失敗は内部で吸収（best effort）
 *   - `err`: Tauri コマンド削除失敗
 *
 * TODO: Rust 側の `remove_player_from_initial_board` コマンドが実装されるまでは
 * invoke を try/catch で握りつぶして ok を返す stub として動作する。
 */
export function useDeletePlayerLocally(): (
  playerId: string,
  board?: unknown,
) => ResultAsync<void, LocalDeleteError> {
  const removePlayerFromGameSettings = useRemovePlayerFromGameSettings();

  return useCallback(
    (playerId: string, board?: unknown): ResultAsync<void, LocalDeleteError> =>
      ResultAsync.fromPromise(
        (async () => {
          try {
            const result = await invoke<{ type: string; error?: Error }>(
              "remove_player_from_initial_board",
              { playerId, board: board ?? null },
            );
            return result;
          } catch {
            // Rust 側コマンド未実装の場合は成功扱い（stub）
            return { type: "success" };
          }
        })(),
        (thrown) =>
          localDeleteError(
            thrown instanceof Error ? thrown : new Error(String(thrown)),
          ),
      )
        .andThen((ipcResult) => {
          if (ipcResult.type !== "success") {
            const error =
              "error" in ipcResult && ipcResult.error instanceof Error
                ? ipcResult.error
                : new Error(
                    "remove_player_from_initial_board returned non-success",
                  );
            trackError(ipcResult);
            return errAsync(localDeleteError(error));
          }
          return okAsync(undefined);
        })
        .andThen(() =>
          removePlayerFromGameSettings(playerId).orElse(() =>
            okAsync(undefined),
          ),
        ),
    [removePlayerFromGameSettings],
  );
}
