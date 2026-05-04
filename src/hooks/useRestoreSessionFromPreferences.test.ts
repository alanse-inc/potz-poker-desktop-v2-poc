/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GameEventDetailResponse,
  GameSessionResponse,
} from "../api/backend";

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

vi.mock("../contexts/operator_context", () => ({
  useOperator: vi.fn(),
}));

vi.mock("../features/error_tracker", () => ({
  trackClientSideError: vi.fn(),
}));

vi.mock("./usePreferences", () => ({
  usePreferences: vi.fn(),
}));

// /api/game-event/set-active の呼び出しをモック (dynamic import)
vi.mock("../api/fetch", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
}));

import { getGameEventDetail } from "../api/backend";
import { useOperator } from "../contexts/operator_context";
import { useSession } from "../contexts/session_context";
import { trackClientSideError } from "../features/error_tracker";
import { usePreferences } from "./usePreferences";
import { useRestoreSessionFromPreferences } from "./useRestoreSessionFromPreferences";

const GAME_EVENT_ID = "eb6b82a3a74bfc70";
const GAME_SESSION_ID = "session1234567890";
const TABLE_ID = "table001";

const STARTED_SESSION: GameSessionResponse = {
  gameSessionId: GAME_SESSION_ID,
  gameEventId: GAME_EVENT_ID,
  gameTableId: TABLE_ID,
  status: "started",
  currentHandNumber: 3,
  startedAt: "2024-01-01T00:00:00Z",
  finishedAt: null,
  gameName: "Test Game",
  texasHoldemSetting: null,
};

const buildGameEventDetail = (
  sessions: (GameSessionResponse & { players: unknown[] })[],
): GameEventDetailResponse => ({
  gameEventId: GAME_EVENT_ID,
  venueId: "venue001",
  gameTableId: TABLE_ID,
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
  sessions,
});

const buildSessionMock = (
  overrides: Partial<ReturnType<typeof useSession>>,
) => ({
  currentSession: null,
  setCurrentSession: vi.fn(),
  currentGameSessionId: null,
  setCurrentGameSessionId: vi.fn(),
  lastHandNumber: 0,
  setLastHandNumber: vi.fn(),
  ...overrides,
});

const buildPreferencesMock = (sessionId: string | null) => ({
  preferences: { lastSelectedSessionId: sessionId, lastSelectedDeckIds: [] },
  isLoaded: true,
  savePreferences: vi.fn(),
});

const buildOperatorMock = (tableId: string | null = null) => ({
  operator: null,
  gameTable: tableId ? { tableId, venueId: "venue001" } : null,
  isLoadingOperator: false,
  isLoadingGameTable: false,
  operatorError: null,
  gameTableError: null,
  loadGameTable: vi.fn(),
});

describe("useRestoreSessionFromPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("started セッションが取得できたら session context を初期化する", async () => {
    const sessionMock = buildSessionMock({});
    vi.mocked(useSession).mockReturnValue(sessionMock);
    vi.mocked(useOperator).mockReturnValue(buildOperatorMock());
    vi.mocked(usePreferences).mockReturnValue(
      buildPreferencesMock(GAME_EVENT_ID),
    );
    vi.mocked(getGameEventDetail).mockResolvedValue(
      buildGameEventDetail([{ ...STARTED_SESSION, players: [] }]),
    );

    renderHook(() => useRestoreSessionFromPreferences("test"));

    await waitFor(() => {
      expect(sessionMock.setCurrentSession).toHaveBeenCalled();
    });
    expect
      .soft(sessionMock.setCurrentGameSessionId)
      .toHaveBeenCalledWith(GAME_SESSION_ID);
    expect.soft(sessionMock.setLastHandNumber).toHaveBeenCalledWith(3);
  });

  it("lastSelectedSessionId が null の場合は何もしない", async () => {
    const sessionMock = buildSessionMock({});
    vi.mocked(useSession).mockReturnValue(sessionMock);
    vi.mocked(useOperator).mockReturnValue(buildOperatorMock());
    vi.mocked(usePreferences).mockReturnValue(buildPreferencesMock(null));

    renderHook(() => useRestoreSessionFromPreferences("test"));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect.soft(getGameEventDetail).not.toHaveBeenCalled();
    expect.soft(sessionMock.setCurrentSession).not.toHaveBeenCalled();
  });

  it("isLoaded が false の場合は何もしない", async () => {
    const sessionMock = buildSessionMock({});
    vi.mocked(useSession).mockReturnValue(sessionMock);
    vi.mocked(useOperator).mockReturnValue(buildOperatorMock());
    vi.mocked(usePreferences).mockReturnValue({
      preferences: {
        lastSelectedSessionId: GAME_EVENT_ID,
        lastSelectedDeckIds: [],
      },
      isLoaded: false,
      savePreferences: vi.fn(),
    });

    renderHook(() => useRestoreSessionFromPreferences("test"));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect.soft(getGameEventDetail).not.toHaveBeenCalled();
  });

  it("currentGameSessionId が既に設定されている場合は何もしない", async () => {
    const sessionMock = buildSessionMock({
      currentGameSessionId: GAME_SESSION_ID,
    });
    vi.mocked(useSession).mockReturnValue(sessionMock);
    vi.mocked(useOperator).mockReturnValue(buildOperatorMock());
    vi.mocked(usePreferences).mockReturnValue(
      buildPreferencesMock(GAME_EVENT_ID),
    );

    renderHook(() => useRestoreSessionFromPreferences("test"));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect.soft(getGameEventDetail).not.toHaveBeenCalled();
  });

  it("getGameEventDetail が失敗した場合は trackClientSideError を呼んで終了", async () => {
    const sessionMock = buildSessionMock({});
    vi.mocked(useSession).mockReturnValue(sessionMock);
    vi.mocked(useOperator).mockReturnValue(buildOperatorMock());
    vi.mocked(usePreferences).mockReturnValue(
      buildPreferencesMock(GAME_EVENT_ID),
    );
    vi.mocked(getGameEventDetail).mockRejectedValue(new Error("network error"));

    renderHook(() => useRestoreSessionFromPreferences("test"));

    await waitFor(() => {
      expect(trackClientSideError).toHaveBeenCalledWith(
        expect.stringContaining("getGameEventDetail failed"),
      );
    });
    expect.soft(sessionMock.setCurrentSession).not.toHaveBeenCalled();
  });

  it("gameTable がある場合はそのテーブルに対応するセッションを優先選択する", async () => {
    const sessionMock = buildSessionMock({});
    vi.mocked(useSession).mockReturnValue(sessionMock);
    vi.mocked(useOperator).mockReturnValue(buildOperatorMock(TABLE_ID));
    vi.mocked(usePreferences).mockReturnValue(
      buildPreferencesMock(GAME_EVENT_ID),
    );
    const otherSession: GameSessionResponse & { players: unknown[] } = {
      ...STARTED_SESSION,
      gameSessionId: "other-session",
      gameTableId: "other-table",
      players: [],
    };
    vi.mocked(getGameEventDetail).mockResolvedValue(
      buildGameEventDetail([otherSession, { ...STARTED_SESSION, players: [] }]),
    );

    renderHook(() => useRestoreSessionFromPreferences("test"));

    await waitFor(() => {
      expect(sessionMock.setCurrentGameSessionId).toHaveBeenCalledWith(
        GAME_SESSION_ID,
      );
    });
  });

  it("セッション一覧が空の場合は setCurrentSession のみ呼ばれる（gameSessionId は設定しない）", async () => {
    const sessionMock = buildSessionMock({});
    vi.mocked(useSession).mockReturnValue(sessionMock);
    vi.mocked(useOperator).mockReturnValue(buildOperatorMock());
    vi.mocked(usePreferences).mockReturnValue(
      buildPreferencesMock(GAME_EVENT_ID),
    );
    vi.mocked(getGameEventDetail).mockResolvedValue(buildGameEventDetail([]));

    renderHook(() => useRestoreSessionFromPreferences("test"));

    await waitFor(() => {
      expect(sessionMock.setCurrentSession).toHaveBeenCalled();
    });
    expect.soft(sessionMock.setCurrentGameSessionId).not.toHaveBeenCalled();
  });
});
