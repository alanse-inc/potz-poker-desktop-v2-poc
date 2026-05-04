/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./useRemovePlayerFromGameSettings", () => ({
  useRemovePlayerFromGameSettings: vi.fn(),
}));

vi.mock("../features/error_tracker", () => ({
  trackError: vi.fn(),
  trackClientSideError: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { trackError } from "../features/error_tracker";
import { useDeletePlayerLocally } from "./useDeletePlayerLocally";
import {
  type RemoveFromGameSettingsError,
  useRemovePlayerFromGameSettings,
} from "./useRemovePlayerFromGameSettings";

const PLAYER_ID = "aa21514eb0668850";

describe("useDeletePlayerLocally", () => {
  let removeFromSettingsMock: ReturnType<
    typeof vi.fn<
      (playerId: string) => ResultAsync<void, RemoveFromGameSettingsError>
    >
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    removeFromSettingsMock = vi.fn(() => okAsync(undefined));
    vi.mocked(useRemovePlayerFromGameSettings).mockReturnValue(
      removeFromSettingsMock,
    );
  });

  it("invoke 成功 → game-settings 同期も実行 → ok を返す", async () => {
    vi.mocked(invoke).mockResolvedValue({ type: "success" });

    const { result } = renderHook(() => useDeletePlayerLocally());
    const outcome = await result.current(PLAYER_ID);

    expect.soft(outcome.isOk()).toBe(true);
    expect.soft(removeFromSettingsMock).toHaveBeenCalledWith(PLAYER_ID);
    expect.soft(trackError).not.toHaveBeenCalled();
  });

  it("invoke が type:error を返す場合: err を返し removePlayerFromGameSettings は呼ばない", async () => {
    const error = new Error("command failed");
    vi.mocked(invoke).mockResolvedValue({ type: "error", error });

    const { result } = renderHook(() => useDeletePlayerLocally());
    const outcome = await result.current(PLAYER_ID);

    expect.soft(outcome.isErr()).toBe(true);
    if (outcome.isErr()) {
      expect.soft(outcome.error._tag).toBe("LocalDeleteError");
      expect.soft(outcome.error.cause).toBe(error);
    }
    expect.soft(removeFromSettingsMock).not.toHaveBeenCalled();
    expect.soft(trackError).toHaveBeenCalledTimes(1);
  });

  it("invoke が例外を throw した場合でも stub として成功扱いになる", async () => {
    // Rust コマンド未実装時は catch で成功扱いになる設計
    vi.mocked(invoke).mockRejectedValue(new Error("command not found"));

    const { result } = renderHook(() => useDeletePlayerLocally());
    const outcome = await result.current(PLAYER_ID);

    expect.soft(outcome.isOk()).toBe(true);
    expect.soft(removeFromSettingsMock).toHaveBeenCalledWith(PLAYER_ID);
  });

  it("removePlayerFromGameSettings の失敗は orElse で吸収して ok を返す（ベストエフォート）", async () => {
    vi.mocked(invoke).mockResolvedValue({ type: "success" });
    removeFromSettingsMock.mockReturnValue(
      errAsync({
        _tag: "RemoveFromGameSettingsError",
        stage: "save" as const,
        cause: new Error("settings save failed"),
      }),
    );

    const { result } = renderHook(() => useDeletePlayerLocally());
    const outcome = await result.current(PLAYER_ID);

    expect.soft(outcome.isOk()).toBe(true);
    expect.soft(removeFromSettingsMock).toHaveBeenCalledWith(PLAYER_ID);
  });
});
