/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSessionResponse } from "../api/backend";

vi.mock("../api/backend", () => ({
  checkoutPlayer: vi.fn(),
  BackendApiError: class BackendApiError extends Error {
    status: number;
    detail: string;
    body: unknown;
    constructor(status: number, detail: string, body: unknown) {
      super(`BackendApiError: status=${status} detail=${detail}`);
      this.name = "BackendApiError";
      this.status = status;
      this.detail = detail;
      this.body = body;
    }
  },
}));

vi.mock("../contexts/session_context", () => ({
  useSession: vi.fn(),
}));

vi.mock("../features/error_tracker", () => ({
  trackClientSideError: vi.fn(),
}));

import { BackendApiError, checkoutPlayer } from "../api/backend";
import { useSession } from "../contexts/session_context";
import { trackClientSideError } from "../features/error_tracker";
import { usePlayerCheckout } from "./usePlayerCheckout";

const STARTED_SESSION: GameSessionResponse = {
  gameSessionId: "session1234567890",
  gameEventId: "eb6b82a3a74bfc70",
  gameTableId: "table001",
  status: "started",
  currentHandNumber: 0,
  startedAt: null,
  finishedAt: null,
  gameName: null,
  texasHoldemSetting: null,
};

const FINISHED_SESSION: GameSessionResponse = {
  ...STARTED_SESSION,
  status: "finished",
};

const PENDING_SESSION: GameSessionResponse = {
  ...STARTED_SESSION,
  status: "pending",
};

const CHECKED_IN_PLAYER_ID = "aa21514eb0668850";
const MANUAL_PLAYER_ID = "V1StGXR8_Z5jdHi6B-myT"; // nanoid 形式
const RESERVED_GUEST_PLAYER_ID = "0000000000000000"; // 予約済みゲスト ID プール先頭
const GAME_SESSION_ID = "session1234567890";

const buildSessionMock = (
  overrides: Partial<ReturnType<typeof useSession>>,
) => ({
  currentSession: STARTED_SESSION,
  setCurrentSession: vi.fn(),
  currentGameSessionId: GAME_SESSION_ID,
  setCurrentGameSessionId: vi.fn(),
  lastHandNumber: 0,
  setLastHandNumber: vi.fn(),
  ...overrides,
});

describe("usePlayerCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("チェックイン由来 ID + started セッション + gameSessionId 設定済み → succeeded を返し API が呼ばれる", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(checkoutPlayer).mockResolvedValue(
      {} as Awaited<ReturnType<typeof checkoutPlayer>>,
    );

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect.soft(outcome).toEqual({ _kind: "succeeded" });
    expect.soft(checkoutPlayer).toHaveBeenCalledWith({
      gameEventId: STARTED_SESSION.gameEventId,
      gameSessionId: GAME_SESSION_ID,
      playerId: CHECKED_IN_PLAYER_ID,
    });
    expect.soft(trackClientSideError).not.toHaveBeenCalled();
  });

  it("手動追加 ID（nanoid）の場合は skipped(not_checked_in_player) を返し API は呼ばれない", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(MANUAL_PLAYER_ID);

    expect
      .soft(outcome)
      .toEqual({ _kind: "skipped", reason: "not_checked_in_player" });
    expect.soft(checkoutPlayer).not.toHaveBeenCalled();
    expect.soft(trackClientSideError).not.toHaveBeenCalled();
  });

  it("予約済みゲスト ID の場合は skipped(not_checked_in_player) を返し API は呼ばれない", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(RESERVED_GUEST_PLAYER_ID);

    expect
      .soft(outcome)
      .toEqual({ _kind: "skipped", reason: "not_checked_in_player" });
    expect.soft(checkoutPlayer).not.toHaveBeenCalled();
    expect.soft(trackClientSideError).not.toHaveBeenCalled();
  });

  it("currentSession が null の場合は skipped(session_not_started) + trackClientSideError 記録", async () => {
    vi.mocked(useSession).mockReturnValue(
      buildSessionMock({ currentSession: null }),
    );

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect
      .soft(outcome)
      .toEqual({ _kind: "skipped", reason: "session_not_started" });
    expect.soft(checkoutPlayer).not.toHaveBeenCalled();
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith(
        "Checked-in player removed but session is not started",
        { cause: expect.any(Error) },
      );
  });

  it("session.status が finished の場合は skipped(session_not_started) + trackClientSideError 記録", async () => {
    vi.mocked(useSession).mockReturnValue(
      buildSessionMock({ currentSession: FINISHED_SESSION }),
    );

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect
      .soft(outcome)
      .toEqual({ _kind: "skipped", reason: "session_not_started" });
    expect.soft(checkoutPlayer).not.toHaveBeenCalled();
    expect.soft(trackClientSideError).toHaveBeenCalledTimes(1);
  });

  it("session.status が pending の場合も skipped(session_not_started) を返す", async () => {
    vi.mocked(useSession).mockReturnValue(
      buildSessionMock({ currentSession: PENDING_SESSION }),
    );

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect
      .soft(outcome)
      .toEqual({ _kind: "skipped", reason: "session_not_started" });
    expect.soft(checkoutPlayer).not.toHaveBeenCalled();
  });

  it("currentGameSessionId が null の場合は skipped(no_game_session_id) + trackClientSideError 記録", async () => {
    vi.mocked(useSession).mockReturnValue(
      buildSessionMock({ currentGameSessionId: null }),
    );

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect
      .soft(outcome)
      .toEqual({ _kind: "skipped", reason: "no_game_session_id" });
    expect.soft(checkoutPlayer).not.toHaveBeenCalled();
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith(
        "gameSessionId が未設定のためチェックアウトをスキップ",
        { cause: expect.any(Error) },
      );
  });

  it("422 PLAYER_NOT_CHECKED_IN: already_checked_out を返し trackClientSideError は呼ばない（冪等成功扱い）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(checkoutPlayer).mockRejectedValue(
      new BackendApiError(
        422,
        "Player aa21514eb0668850 is not actively checked in to session abc",
        null,
      ),
    );

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect.soft(outcome).toEqual({ _kind: "already_checked_out" });
    expect.soft(trackClientSideError).not.toHaveBeenCalled();
  });

  it("422 だが PLAYER_NOT_CHECKED_IN ではない: failed を返し trackClientSideError を呼ぶ", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(checkoutPlayer).mockRejectedValue(
      new BackendApiError(422, "Some other validation error", null),
    );

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect.soft(outcome).toEqual({
      _kind: "failed",
      status: 422,
      message: "Some other validation error",
    });
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith("Failed to checkout player", {
        cause: expect.any(Error),
      });
  });

  it("5xx server error: failed を status 付きで返し trackClientSideError を呼ぶ", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(checkoutPlayer).mockRejectedValue(
      new BackendApiError(500, "Internal Server Error", null),
    );

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect.soft(outcome).toEqual({
      _kind: "failed",
      status: 500,
      message: "Internal Server Error",
    });
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith("Failed to checkout player", {
        cause: expect.any(Error),
      });
  });

  it("checkoutPlayer が非 BackendApiError で throw した場合は failed (status 0) を返す", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    const error = new Error("network failure");
    vi.mocked(checkoutPlayer).mockRejectedValue(error);

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect
      .soft(outcome)
      .toEqual({ _kind: "failed", status: 0, message: "network failure" });
    expect
      .soft(trackClientSideError)
      .toHaveBeenCalledWith("Failed to checkout player", { cause: error });
  });

  it("checkoutPlayer が非 Error 値で reject した場合: failed の message は既定文言になる（防御コード）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(checkoutPlayer).mockRejectedValue("not-an-error");

    const { result } = renderHook(() => usePlayerCheckout());
    const outcome = await result.current(CHECKED_IN_PLAYER_ID);

    expect.soft(outcome).toEqual({
      _kind: "failed",
      status: 0,
      message: "checkout API exception",
    });
  });
});
