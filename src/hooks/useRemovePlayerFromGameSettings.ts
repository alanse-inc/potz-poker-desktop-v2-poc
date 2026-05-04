import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { useCallback } from "react";
import { match } from "ts-pattern";
import { z } from "zod";
import { apiFetch } from "../api/fetch";
import type { PersistedGameSettings } from "../domain/table_name";
import { trackClientSideError } from "../features/error_tracker";

/**
 * `useRemovePlayerFromGameSettings` のエラー型。
 * `stage` で失敗段階を判別し、呼び出し側のリトライ戦略や UX 通知の判断材料とする。
 */
export type RemoveFromGameSettingsError = {
  readonly _tag: "RemoveFromGameSettingsError";
  readonly stage: "fetch" | "parse" | "save" | "exception";
  readonly cause: Error;
};

const removeError = (
  stage: RemoveFromGameSettingsError["stage"],
  cause: Error,
): RemoveFromGameSettingsError => ({
  _tag: "RemoveFromGameSettingsError",
  stage,
  cause,
});

const exceptionToError = (e: unknown): Error =>
  e instanceof Error ? e : new Error(String(e));

/**
 * `/api/game-settings` GET レスポンスの最低限スキーマ。
 */
const GameSettingsGetResponseSchema = z.object({
  type: z.string(),
  value: z.unknown().nullable(),
});

/**
 * 削除したプレイヤーをローカル永続ストア (`game-settings`) からも除去するフック。
 *
 * `manualMode.players` / `autoMode.players` から指定プレイヤーを除外し、
 * `POST /api/game-settings` で永続化する。失敗時は `RemoveFromGameSettingsError` を返す。
 *
 * 戻り値は `ResultAsync<void, RemoveFromGameSettingsError>`:
 *   - `ok`: 永続化済みプレイヤーから対象を除外して保存完了 / 永続化された設定が存在せず no-op
 *   - `err`: GET / parse / POST 失敗、または apiFetch の throw
 */
export function useRemovePlayerFromGameSettings(): (
  playerId: string,
) => ResultAsync<void, RemoveFromGameSettingsError> {
  return useCallback(
    (playerId: string): ResultAsync<void, RemoveFromGameSettingsError> =>
      ResultAsync.fromPromise(apiFetch("/api/game-settings"), (e) =>
        removeError("exception", exceptionToError(e)),
      )
        .andThen((response) => {
          if (!response.ok) {
            return errAsync(
              removeError("fetch", new Error(`HTTP ${response.status}`)),
            );
          }
          return ResultAsync.fromPromise(
            response.json() as Promise<unknown>,
            (e) => removeError("exception", exceptionToError(e)),
          ).andThen((rawBody) => {
            const parsed = GameSettingsGetResponseSchema.safeParse(rawBody);
            if (!parsed.success) {
              return errAsync(
                removeError("parse", new Error(parsed.error.message)),
              );
            }
            return okAsync(parsed.data);
          });
        })
        .andThen((settingsResult) => {
          if (
            settingsResult.type !== "success" ||
            settingsResult.value === null
          ) {
            // 永続化された設定がまだ無い場合は何もしない（除外対象も存在しない）
            return okAsync(undefined);
          }

          const existing = settingsResult.value as PersistedGameSettings;
          const updated: PersistedGameSettings = {
            ...existing,
            manualMode: {
              ...existing.manualMode,
              players: existing.manualMode.players.filter(
                (p) => p.id !== playerId,
              ),
            },
            autoMode: {
              ...existing.autoMode,
              players: existing.autoMode.players.filter(
                (p) => p.id !== playerId,
              ),
            },
          };

          return ResultAsync.fromPromise(
            apiFetch("/api/game-settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updated),
            }),
            (e) => removeError("exception", exceptionToError(e)),
          ).andThen((saveResponse) => {
            if (!saveResponse.ok) {
              return errAsync(
                removeError("save", new Error(`HTTP ${saveResponse.status}`)),
              );
            }
            return okAsync(undefined);
          });
        })
        .orElse((error) => {
          match(error.stage)
            .with("fetch", () =>
              trackClientSideError(
                "Failed to fetch game settings during player removal",
                { cause: error.cause },
              ),
            )
            .with("parse", () =>
              trackClientSideError(
                "Failed to parse game settings response during player removal",
                { cause: error.cause },
              ),
            )
            .with("save", () =>
              trackClientSideError(
                "Failed to save game settings during player removal",
                { cause: error.cause },
              ),
            )
            .with("exception", () =>
              trackClientSideError(
                "Failed to remove player from game settings",
                { cause: error.cause },
              ),
            )
            .exhaustive();
          return errAsync(error);
        }),
    [],
  );
}
