import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { TexasHoldemBoard } from "../types";
import { BoardProvider, useBoard } from "./board_context";

// api/client モジュール全体を mock
vi.mock("../api/client", () => ({
  api: {
    board: {
      getBoard: vi.fn(),
    },
    notifications: {
      onBoardUpdated: vi.fn(),
    },
  },
}));

const makeBoard = (
  override: Partial<TexasHoldemBoard> = {},
): TexasHoldemBoard => ({
  handNumber: 1,
  dealerPosition: 0,
  sbPosition: 1,
  bbPosition: 2,
  currentTurn: 0,
  currentBet: 200,
  players: [
    {
      position: 0,
      name: "Alice",
      stack: 9800,
      hand: null,
      betInRound: 0,
      hasFolded: false,
      isAllIn: false,
    },
    {
      position: 1,
      name: "Bob",
      stack: 9900,
      hand: null,
      betInRound: 100,
      hasFolded: false,
      isAllIn: false,
    },
  ],
  communityCards: [],
  pots: [{ amount: 300 }],
  phase: "pre_flop",
  ...override,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <BoardProvider>{children}</BoardProvider>
);

describe("BoardProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.board.getBoard).mockResolvedValue(null);
    // onBoardUpdated のデフォルト: unsubscribe 関数を返す
    vi.mocked(api.notifications.onBoardUpdated).mockResolvedValue(() => {});
  });

  it("初期マウント時に api.board.getBoard() を呼ぶ", async () => {
    renderHook(() => useBoard(), { wrapper });

    await waitFor(() => {
      expect(api.board.getBoard).toHaveBeenCalledTimes(1);
    });
  });

  it("初期状態で board は null、loading は最終的に false になる", async () => {
    vi.mocked(api.board.getBoard).mockResolvedValue(null);

    const { result } = renderHook(() => useBoard(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.board).toBeNull();
  });

  it("getBoard() が board を返した場合、useBoard().board に反映される", async () => {
    const board = makeBoard();
    vi.mocked(api.board.getBoard).mockResolvedValue(board);

    const { result } = renderHook(() => useBoard(), { wrapper });

    await waitFor(() => {
      expect(result.current.board).toEqual(board);
    });

    expect(result.current.loading).toBe(false);
  });

  it("onBoardUpdated(cb) を購読し、push されると board が更新される", async () => {
    vi.mocked(api.board.getBoard).mockResolvedValue(null);

    let capturedCb: ((b: TexasHoldemBoard) => void) | undefined;
    vi.mocked(api.notifications.onBoardUpdated).mockImplementation(
      async (cb) => {
        capturedCb = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useBoard(), { wrapper });

    // onBoardUpdated が登録されるまで待つ
    await waitFor(() => {
      expect(api.notifications.onBoardUpdated).toHaveBeenCalledTimes(1);
    });

    // イベントを手動で emit
    const updatedBoard = makeBoard({ handNumber: 2 });
    act(() => {
      capturedCb?.(updatedBoard);
    });

    await waitFor(() => {
      expect(result.current.board).toEqual(updatedBoard);
    });
  });

  it("アンマウント時に unsubscribe が呼ばれる", async () => {
    const unsubscribe = vi.fn();
    vi.mocked(api.notifications.onBoardUpdated).mockResolvedValue(unsubscribe);

    const { unmount } = renderHook(() => useBoard(), { wrapper });

    // subscribeが完了するまで待つ
    await waitFor(() => {
      expect(api.notifications.onBoardUpdated).toHaveBeenCalledTimes(1);
    });

    unmount();

    // unsubscribe が呼ばれることを確認（非同期で設定されるため少し待つ）
    await waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it("BoardProvider の外で useBoard() を呼ぶとエラーになる", () => {
    // エラーが throw されることを確認
    expect(() => {
      renderHook(() => useBoard());
    }).toThrow("useBoard must be used within BoardProvider");
  });
});
