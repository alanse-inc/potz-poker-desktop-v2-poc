/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSessionResponse } from "../api/backend";

vi.mock("../api/backend", () => ({
  getGameEventDetail: vi.fn(),
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

vi.mock("./useRemovePlayerFromGameSettings", () => ({
  useRemovePlayerFromGameSettings: vi.fn(),
}));

import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import type {
  GameEventDetailResponse,
  GameSessionPlayerResponse,
} from "../api/backend";
import { getGameEventDetail } from "../api/backend";
import { useSession } from "../contexts/session_context";
import { trackClientSideError } from "../features/error_tracker";
import {
  __resetReconciliationStateForTesting,
  useReconcileCheckedOutPlayers,
} from "./useReconcileCheckedOutPlayers";
import {
  type RemoveFromGameSettingsError,
  useRemovePlayerFromGameSettings,
} from "./useRemovePlayerFromGameSettings";

const GAME_EVENT_ID = "eb6b82a3a74bfc70";
const GAME_SESSION_ID = "session1234567890";
const ACTIVE_PLAYER_ID = "aa21514eb0668850";
const CHECKED_OUT_PLAYER_ID = "bb31525fc1779961";
const ANOTHER_CHECKED_OUT_PLAYER_ID = "cc41626fd1880072";
const MANUAL_PLAYER_ID = "V1StGXR8_Z5jdHi6B-myT"; // nanoid (hex16 にマッチしない)
const RESERVED_GUEST_PLAYER_ID = "0000000000000000"; // 予約済みゲスト ID

const STARTED_SESSION: GameSessionResponse = {
  gameSessionId: GAME_SESSION_ID,
  gameEventId: GAME_EVENT_ID,
  gameTableId: "table001",
  status: "started",
  currentHandNumber: 0,
  startedAt: null,
  finishedAt: null,
  gameName: null,
  texasHoldemSetting: null,
};

const buildPlayerRecord = (
  overrides: Partial<GameSessionPlayerResponse>,
): GameSessionPlayerResponse => ({
  gameSessionId: GAME_SESSION_ID,
  playerId: ACTIVE_PLAYER_ID,
  nickName: "test",
  avatarPath: null,
  startHandNumber: 0,
  finishedHandNumber: null,
  checkedInAt: "2024-01-01T00:00:00Z",
  checkedOutAt: null,
  ...overrides,
});

const buildGameEventDetail = (
  players: GameSessionPlayerResponse[],
): GameEventDetailResponse => ({
  gameEventId: GAME_EVENT_ID,
  venueId: "venue001",
  gameTableId: "table001",
  gameRule: "texas_holdem",
  gameFormat: "ring_game",
  status: "started",
  gameName: "Test Event",
  defaultStack: null,
  miniChip: 100,
  smallBlind: 100,
  bigBlind: 200,
  anteRule: "none",
  blindExceptionRule: "dead_button",
  startDate: "2024-01-01",
  startedAt: "2024-01-01T00:00:00Z",
  finishedAt: null,
  startedTableId: null,
  sessions: [
    {
      gameSessionId: GAME_SESSION_ID,
      gameEventId: GAME_EVENT_ID,
      gameTableId: "table001",
      status: "started",
      currentHandNumber: 0,
      startedAt: null,
      finishedAt: null,
      gameName: null,
      texasHoldemSetting: null,
      players,
    },
  ],
});

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

describe("useReconcileCheckedOutPlayers", () => {
  let removeMock: ReturnType<
    typeof vi.fn<
      (playerId: string) => ResultAsync<void, RemoveFromGameSettingsError>
    >
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetReconciliationStateForTesting();
    removeMock = vi.fn(() => okAsync(undefined));
    vi.mocked(useRemovePlayerFromGameSettings).mockReturnValue(removeMock);
  });

  it("started session で finishedHandNumber 持ちのプレイヤーのみ削除する", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(getGameEventDetail).mockResolvedValue(
      buildGameEventDetail([
        buildPlayerRecord({
          playerId: ACTIVE_PLAYER_ID,
          finishedHandNumber: null,
        }),
        buildPlayerRecord({
          playerId: CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 5,
        }),
        buildPlayerRecord({
          playerId: ANOTHER_CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: null,
          checkedOutAt: "2024-01-01T01:00:00Z",
        }),
      ]),
    );

    renderHook(() => useReconcileCheckedOutPlayers());

    await waitFor(() => {
      expect(getGameEventDetail).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledTimes(2);
    });

    expect.soft(removeMock).toHaveBeenCalledWith(CHECKED_OUT_PLAYER_ID);
    expect.soft(removeMock).toHaveBeenCalledWith(ANOTHER_CHECKED_OUT_PLAYER_ID);
    expect.soft(removeMock).not.toHaveBeenCalledWith(ACTIVE_PLAYER_ID);
  });

  it("hex16 形式以外の playerId は除外する（手動追加プレイヤー保護）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(getGameEventDetail).mockResolvedValue(
      buildGameEventDetail([
        buildPlayerRecord({
          playerId: MANUAL_PLAYER_ID,
          finishedHandNumber: 5,
        }),
        buildPlayerRecord({
          playerId: CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 5,
        }),
      ]),
    );

    renderHook(() => useReconcileCheckedOutPlayers());

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledTimes(1);
    });
    expect.soft(removeMock).toHaveBeenCalledWith(CHECKED_OUT_PLAYER_ID);
    expect.soft(removeMock).not.toHaveBeenCalledWith(MANUAL_PLAYER_ID);
  });

  it("予約済みゲスト ID は除外する（hex16 形式に一致しても手動追加プレイヤー専用 ID のため）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(getGameEventDetail).mockResolvedValue(
      buildGameEventDetail([
        buildPlayerRecord({
          playerId: RESERVED_GUEST_PLAYER_ID,
          finishedHandNumber: 5,
        }),
        buildPlayerRecord({
          playerId: CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 5,
        }),
      ]),
    );

    renderHook(() => useReconcileCheckedOutPlayers());

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledTimes(1);
    });
    expect.soft(removeMock).toHaveBeenCalledWith(CHECKED_OUT_PLAYER_ID);
    expect.soft(removeMock).not.toHaveBeenCalledWith(RESERVED_GUEST_PLAYER_ID);
  });

  it("status !== 'started' の場合は何もしない", async () => {
    vi.mocked(useSession).mockReturnValue(
      buildSessionMock({
        currentSession: { ...STARTED_SESSION, status: "pending" },
      }),
    );

    renderHook(() => useReconcileCheckedOutPlayers());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect.soft(getGameEventDetail).not.toHaveBeenCalled();
    expect.soft(removeMock).not.toHaveBeenCalled();
  });

  it("currentSession が null の場合は何もしない", async () => {
    vi.mocked(useSession).mockReturnValue(
      buildSessionMock({ currentSession: null }),
    );

    renderHook(() => useReconcileCheckedOutPlayers());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect.soft(getGameEventDetail).not.toHaveBeenCalled();
  });

  it("currentGameSessionId が null の場合は何もしない", async () => {
    vi.mocked(useSession).mockReturnValue(
      buildSessionMock({ currentGameSessionId: null }),
    );

    renderHook(() => useReconcileCheckedOutPlayers());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect.soft(getGameEventDetail).not.toHaveBeenCalled();
  });

  it("fetch 失敗時は trackClientSideError を呼んで終了（UI を止めない）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(getGameEventDetail).mockRejectedValue(
      new (class BackendApiError extends Error {
        status = 500;
        detail = "Internal Server Error";
        body = null;
        constructor() {
          super("BackendApiError: status=500 detail=Internal Server Error");
          this.name = "BackendApiError";
        }
      })(),
    );

    renderHook(() => useReconcileCheckedOutPlayers());

    await waitFor(() => {
      expect(trackClientSideError).toHaveBeenCalledWith(
        "Reconciliation: failed to fetch session detail",
        { cause: expect.any(Error) },
      );
    });
    expect.soft(removeMock).not.toHaveBeenCalled();
  });

  it("同一 (gameEventId, gameSessionId) に対しては再レンダリングしても 1 回のみ実行する", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(getGameEventDetail).mockResolvedValue(
      buildGameEventDetail([
        buildPlayerRecord({
          playerId: CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 1,
        }),
      ]),
    );

    const { rerender } = renderHook(() => useReconcileCheckedOutPlayers());

    await waitFor(() => {
      expect(getGameEventDetail).toHaveBeenCalledTimes(1);
    });

    rerender();
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect.soft(getGameEventDetail).toHaveBeenCalledTimes(1);
  });

  it("別の component instance でも同一 session は 1 回のみ実行（module-scope dedup）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(getGameEventDetail).mockResolvedValue(
      buildGameEventDetail([
        buildPlayerRecord({
          playerId: CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 1,
        }),
      ]),
    );

    const { unmount: unmount1 } = renderHook(() =>
      useReconcileCheckedOutPlayers(),
    );
    await waitFor(() => {
      expect(getGameEventDetail).toHaveBeenCalledTimes(1);
    });
    unmount1();

    renderHook(() => useReconcileCheckedOutPlayers());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect.soft(getGameEventDetail).toHaveBeenCalledTimes(1);
  });

  it("fetch 失敗後は次回 mount で再試行できる（ref がクリアされる）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(getGameEventDetail)
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce(
        buildGameEventDetail([
          buildPlayerRecord({
            playerId: CHECKED_OUT_PLAYER_ID,
            finishedHandNumber: 1,
          }),
        ]),
      );

    const { unmount: unmount1 } = renderHook(() =>
      useReconcileCheckedOutPlayers(),
    );
    await waitFor(() => {
      expect(trackClientSideError).toHaveBeenCalledWith(
        "Reconciliation: unexpected error",
        { cause: expect.any(Error) },
      );
    });
    unmount1();

    renderHook(() => useReconcileCheckedOutPlayers());
    await waitFor(() => {
      expect(getGameEventDetail).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith(CHECKED_OUT_PLAYER_ID);
    });
  });

  it("unmount された後は removePlayerFromGameSettings が呼ばれない（abort）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    let resolveDetail: ((value: never) => void) | undefined;
    vi.mocked(getGameEventDetail).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve as never;
        }),
    );

    const { unmount } = renderHook(() => useReconcileCheckedOutPlayers());

    unmount();

    resolveDetail?.(
      buildGameEventDetail([
        buildPlayerRecord({
          playerId: CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 1,
        }),
      ]) as never,
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect.soft(removeMock).not.toHaveBeenCalled();
  });

  it("fetch 中に unmount (abort) された場合、次回 mount で reconciledSessionKeys が削除されて再試行できる（Bug 6）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));

    let resolveDetail: ((value: never) => void) | undefined;
    vi.mocked(getGameEventDetail)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDetail = resolve as never;
          }),
      )
      .mockResolvedValueOnce(
        buildGameEventDetail([
          buildPlayerRecord({
            playerId: CHECKED_OUT_PLAYER_ID,
            finishedHandNumber: 1,
          }),
        ]),
      );

    // 1 回目: fetch 中に unmount → abort
    const { unmount } = renderHook(() => useReconcileCheckedOutPlayers());

    // unmount → abortController.abort() が走る
    unmount();

    // fetch が pending のまま resolve する (abort 後)
    resolveDetail?.(
      buildGameEventDetail([
        buildPlayerRecord({
          playerId: CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 1,
        }),
      ]) as never,
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    // abort されているので removePlayerFromGameSettings は呼ばれない
    expect.soft(removeMock).not.toHaveBeenCalled();

    // 2 回目: 同じ session キーで再マウント → reconciledSessionKeys が削除済みなので再試行される
    renderHook(() => useReconcileCheckedOutPlayers());

    await waitFor(() => {
      expect(getGameEventDetail).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith(CHECKED_OUT_PLAYER_ID);
    });
  });

  it("removePlayerFromGameSettings が err を返してもクラッシュせず Promise.all が完了する", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(getGameEventDetail).mockResolvedValue(
      buildGameEventDetail([
        buildPlayerRecord({
          playerId: CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 1,
        }),
        buildPlayerRecord({
          playerId: ANOTHER_CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 2,
        }),
      ]),
    );
    removeMock.mockImplementation((playerId: string) =>
      playerId === CHECKED_OUT_PLAYER_ID
        ? errAsync({
            _tag: "RemoveFromGameSettingsError" as const,
            stage: "save" as const,
            cause: new Error("network failure"),
          })
        : okAsync(undefined),
    );

    renderHook(() => useReconcileCheckedOutPlayers());

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledTimes(2);
    });
    expect.soft(removeMock).toHaveBeenCalledWith(CHECKED_OUT_PLAYER_ID);
    expect.soft(removeMock).toHaveBeenCalledWith(ANOTHER_CHECKED_OUT_PLAYER_ID);
  });

  it("Promise.all 完了後に unmount されていた場合は reconciledSessionKeys を削除して副作用を走らせない（Bug 5）", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));

    let resolveRemove: (() => void) | undefined;
    vi.mocked(getGameEventDetail).mockResolvedValue(
      buildGameEventDetail([
        buildPlayerRecord({
          playerId: CHECKED_OUT_PLAYER_ID,
          finishedHandNumber: 1,
        }),
      ]),
    );
    // removePlayerFromGameSettings を pending にして Promise.all 完了のタイミングを制御する
    removeMock.mockImplementation(
      () =>
        new Promise<ReturnType<typeof okAsync>>((resolve) => {
          resolveRemove = () => resolve(okAsync(undefined) as never);
        }),
    );

    const { unmount } = renderHook(() => useReconcileCheckedOutPlayers());

    // getGameEventDetail が完了するまで待つ
    await waitFor(() => {
      expect(getGameEventDetail).toHaveBeenCalledTimes(1);
    });

    // Promise.all 実行中に unmount → abortController.abort()
    unmount();

    // Promise.all の中の remove を完了させる
    resolveRemove?.();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // abort 後なので reconciledSessionKeys からキーが削除されているはず
    // 2 回目のマウントで再試行できることを確認
    removeMock.mockImplementation(() => okAsync(undefined));
    renderHook(() => useReconcileCheckedOutPlayers());
    await waitFor(() => {
      expect(getGameEventDetail).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith(CHECKED_OUT_PLAYER_ID);
    });
  });

  it("予期せぬ throw（ネットワーク例外等）でも次回再試行可能", async () => {
    vi.mocked(useSession).mockReturnValue(buildSessionMock({}));
    vi.mocked(getGameEventDetail)
      .mockRejectedValueOnce(new Error("network throw"))
      .mockResolvedValueOnce(
        buildGameEventDetail([
          buildPlayerRecord({
            playerId: CHECKED_OUT_PLAYER_ID,
            finishedHandNumber: 1,
          }),
        ]),
      );

    const { unmount: unmount1 } = renderHook(() =>
      useReconcileCheckedOutPlayers(),
    );
    await waitFor(() => {
      expect(trackClientSideError).toHaveBeenCalledWith(
        "Reconciliation: unexpected error",
        { cause: expect.any(Error) },
      );
    });
    unmount1();

    renderHook(() => useReconcileCheckedOutPlayers());
    await waitFor(() => {
      expect(getGameEventDetail).toHaveBeenCalledTimes(2);
    });
  });
});
