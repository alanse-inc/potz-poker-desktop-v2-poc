/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultGameSettings,
  type PersistedGameSettings,
} from "../domain/table_name";

vi.mock("../api/fetch", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../features/error_tracker", () => ({
  trackClientSideError: vi.fn(),
}));

import { apiFetch } from "../api/fetch";
import { trackClientSideError } from "../features/error_tracker";
import { useRemovePlayerFromGameSettings } from "./useRemovePlayerFromGameSettings";

const TARGET_PLAYER_ID = "aa21514eb0668850";
const OTHER_PLAYER_ID = "bb31525fc1779961";

const buildSettingsWithPlayers = (): PersistedGameSettings => {
  const base = createDefaultGameSettings();
  return {
    ...base,
    manualMode: {
      ...base.manualMode,
      players: [
        {
          id: TARGET_PLAYER_ID,
          name: "削除対象",
          icon: null,
          status: "active",
          stack: 1000,
          seat: 1,
          position: null,
        },
        {
          id: OTHER_PLAYER_ID,
          name: "残るプレイヤー",
          icon: null,
          status: "active",
          stack: 2000,
          seat: 2,
          position: null,
        },
      ],
    },
    autoMode: {
      ...base.autoMode,
      players: [
        {
          id: TARGET_PLAYER_ID,
          name: "削除対象",
          icon: null,
          seat: 1,
          position: null,
        },
        {
          id: OTHER_PLAYER_ID,
          name: "残るプレイヤー",
          icon: null,
          seat: 2,
          position: null,
        },
      ],
    },
  };
};

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const errorResponse = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as Response;

describe("useRemovePlayerFromGameSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("manualMode / autoMode の両方から対象プレイヤーを除外して保存し ok を返す", async () => {
    const settings = buildSettingsWithPlayers();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(okResponse({ type: "success", value: settings }))
      .mockResolvedValueOnce(okResponse({ type: "success" }));

    const { result } = renderHook(() => useRemovePlayerFromGameSettings());
    const outcome = await result.current(TARGET_PLAYER_ID);

    expect.soft(outcome.isOk()).toBe(true);
    expect.soft(apiFetch).toHaveBeenCalledTimes(2);
    const [, secondCall] = vi.mocked(apiFetch).mock.calls;
    expect.soft(secondCall[0]).toBe("/api/game-settings");
    const body = JSON.parse(
      (secondCall[1] as { body: string }).body,
    ) as PersistedGameSettings;
    expect
      .soft(body.manualMode.players.map((p) => p.id))
      .toEqual([OTHER_PLAYER_ID]);
    expect
      .soft(body.autoMode.players.map((p) => p.id))
      .toEqual([OTHER_PLAYER_ID]);
    expect.soft(trackClientSideError).not.toHaveBeenCalled();
  });

  it("game-settings がまだ無い場合（value が null）は何もせず ok を返す", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(
      okResponse({ type: "success", value: null }),
    );

    const { result } = renderHook(() => useRemovePlayerFromGameSettings());
    const outcome = await result.current(TARGET_PLAYER_ID);

    expect.soft(outcome.isOk()).toBe(true);
    // fetch は 1 回のみ（save には進まない）
    expect.soft(apiFetch).toHaveBeenCalledTimes(1);
    expect.soft(trackClientSideError).not.toHaveBeenCalled();
  });

  it("GET /api/game-settings が失敗した場合は err(stage='fetch') を返し trackClientSideError を呼ぶ", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(errorResponse(500));

    const { result } = renderHook(() => useRemovePlayerFromGameSettings());
    const outcome = await result.current(TARGET_PLAYER_ID);

    expect.soft(outcome.isErr()).toBe(true);
    if (outcome.isErr()) {
      expect.soft(outcome.error._tag).toBe("RemoveFromGameSettingsError");
      expect.soft(outcome.error.stage).toBe("fetch");
    }
    expect.soft(apiFetch).toHaveBeenCalledTimes(1);
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith(
        "Failed to fetch game settings during player removal",
        { cause: expect.any(Error) },
      );
  });

  it("POST /api/game-settings が失敗した場合は err(stage='save') を返し trackClientSideError を呼ぶ", async () => {
    const settings = buildSettingsWithPlayers();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(okResponse({ type: "success", value: settings }))
      .mockResolvedValueOnce(errorResponse(500));

    const { result } = renderHook(() => useRemovePlayerFromGameSettings());
    const outcome = await result.current(TARGET_PLAYER_ID);

    expect.soft(outcome.isErr()).toBe(true);
    if (outcome.isErr()) {
      expect.soft(outcome.error.stage).toBe("save");
    }
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith(
        "Failed to save game settings during player removal",
        { cause: expect.any(Error) },
      );
  });

  it("response.json() が想定外の形状の場合は err(stage='parse') を返し trackClientSideError を呼ぶ", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(
      // Zod スキーマに合わない body（type フィールドが無い）
      okResponse({ unexpected: "shape" }),
    );

    const { result } = renderHook(() => useRemovePlayerFromGameSettings());
    const outcome = await result.current(TARGET_PLAYER_ID);

    expect.soft(outcome.isErr()).toBe(true);
    if (outcome.isErr()) {
      expect.soft(outcome.error.stage).toBe("parse");
    }
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith(
        "Failed to parse game settings response during player removal",
        { cause: expect.any(Error) },
      );
  });

  it("apiFetch が throw した場合は err(stage='exception') を返し trackClientSideError を呼ぶ", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("network failure"));

    const { result } = renderHook(() => useRemovePlayerFromGameSettings());
    const outcome = await result.current(TARGET_PLAYER_ID);

    expect.soft(outcome.isErr()).toBe(true);
    if (outcome.isErr()) {
      expect.soft(outcome.error.stage).toBe("exception");
    }
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith("Failed to remove player from game settings", {
        cause: expect.any(Error),
      });
  });

  it("GET レスポンスの response.json() が throw した場合は err(stage='exception')", async () => {
    const brokenResponse = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("json parse failed");
      },
    } as Response;
    vi.mocked(apiFetch).mockResolvedValueOnce(brokenResponse);

    const { result } = renderHook(() => useRemovePlayerFromGameSettings());
    const outcome = await result.current(TARGET_PLAYER_ID);

    expect.soft(outcome.isErr()).toBe(true);
    if (outcome.isErr()) {
      expect.soft(outcome.error.stage).toBe("exception");
    }
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith("Failed to remove player from game settings", {
        cause: expect.any(Error),
      });
  });

  it("POST 側の apiFetch が throw した場合も err(stage='exception')", async () => {
    const settings = buildSettingsWithPlayers();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(okResponse({ type: "success", value: settings }))
      .mockRejectedValueOnce(new Error("post network failure"));

    const { result } = renderHook(() => useRemovePlayerFromGameSettings());
    const outcome = await result.current(TARGET_PLAYER_ID);

    expect.soft(outcome.isErr()).toBe(true);
    if (outcome.isErr()) {
      expect.soft(outcome.error.stage).toBe("exception");
    }
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith("Failed to remove player from game settings", {
        cause: expect.any(Error),
      });
  });

  it("対象プレイヤーが存在しない場合も既存リストを保ったまま POST し ok を返す（冪等性）", async () => {
    const settings = buildSettingsWithPlayers();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(okResponse({ type: "success", value: settings }))
      .mockResolvedValueOnce(okResponse({ type: "success" }));

    const { result } = renderHook(() => useRemovePlayerFromGameSettings());
    const outcome = await result.current("zzzzzzzzzzzzzzzz");

    expect.soft(outcome.isOk()).toBe(true);
    const [, secondCall] = vi.mocked(apiFetch).mock.calls;
    const body = JSON.parse(
      (secondCall[1] as { body: string }).body,
    ) as PersistedGameSettings;
    // 既存のプレイヤーは全員残る
    expect
      .soft(body.manualMode.players.map((p) => p.id))
      .toEqual([TARGET_PLAYER_ID, OTHER_PLAYER_ID]);
  });
});
