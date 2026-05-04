import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { GameSessionResponse } from "../api/backend";
import { SessionProvider, useSession } from "./session_context";

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);

const makeSession = (
  override: Partial<GameSessionResponse> = {},
): GameSessionResponse => ({
  gameSessionId: "session-1",
  gameEventId: "event-1",
  gameTableId: "table-1",
  status: "started",
  currentHandNumber: 1,
  startedAt: "2024-01-01T00:00:00Z",
  finishedAt: null,
  gameName: "Test Game",
  texasHoldemSetting: {
    miniChip: 100,
    smallBlind: 100,
    bigBlind: 200,
    anteRule: "none",
    blindExceptionRule: "dead_button",
  },
  ...override,
});

describe("SessionProvider", () => {
  it("初期状態で currentSession は null", () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.currentSession).toBeNull();
  });

  it("初期状態で currentGameSessionId は null", () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.currentGameSessionId).toBeNull();
  });

  it("初期状態で lastHandNumber は 0", () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.lastHandNumber).toBe(0);
  });

  it("setCurrentSession でセッションを更新できる", () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    const session = makeSession();

    act(() => {
      result.current.setCurrentSession(session);
    });

    expect(result.current.currentSession).toEqual(session);
  });

  it("setCurrentSession に null を渡すとセッションをクリアできる", () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    const session = makeSession();

    act(() => {
      result.current.setCurrentSession(session);
    });
    act(() => {
      result.current.setCurrentSession(null);
    });

    expect(result.current.currentSession).toBeNull();
  });

  it("setCurrentGameSessionId でゲームセッション ID を更新できる", () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.setCurrentGameSessionId("game-session-abc");
    });

    expect(result.current.currentGameSessionId).toBe("game-session-abc");
  });

  it("setCurrentGameSessionId に null を渡すと ID をクリアできる", () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.setCurrentGameSessionId("game-session-abc");
    });
    act(() => {
      result.current.setCurrentGameSessionId(null);
    });

    expect(result.current.currentGameSessionId).toBeNull();
  });

  it("setLastHandNumber でハンド番号を更新できる", () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.setLastHandNumber(42);
    });

    expect(result.current.lastHandNumber).toBe(42);
  });

  it("SessionProvider の外で useSession を呼ぶとエラーになる", () => {
    expect(() => {
      renderHook(() => useSession());
    }).toThrow("useSession must be used within SessionProvider");
  });
});
