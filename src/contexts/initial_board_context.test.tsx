import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { TexasHoldemInitialBoard } from "../types";
import { InitialBoardProvider, useInitialBoard } from "./initial_board_context";

vi.mock("../api/client", () => ({
  api: {
    initialBoard: {
      getInitialBoard: vi.fn(),
    },
    notifications: {
      onInitialBoardUpdated: vi.fn(),
    },
  },
}));

const makeInitialBoard = (
  override: Partial<TexasHoldemInitialBoard> = {},
): TexasHoldemInitialBoard => ({
  handNumber: 1,
  dealerPosition: 0,
  players: [
    {
      position: 0,
      name: "Alice",
      stack: 10000,
      hand: null,
      betInRound: 0,
      hasFolded: false,
      isAllIn: false,
      hasActed: false,
    },
    {
      position: 1,
      name: "Bob",
      stack: 10000,
      hand: null,
      betInRound: 0,
      hasFolded: false,
      isAllIn: false,
      hasActed: false,
    },
  ],
  settings: {
    smallBlind: 100,
    bigBlind: 200,
    minChip: 100,
    bbAnte: false,
  },
  ...override,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <InitialBoardProvider>{children}</InitialBoardProvider>
);

describe("InitialBoardProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.initialBoard.getInitialBoard).mockRejectedValue(
      new Error("not implemented"),
    );
    vi.mocked(api.notifications.onInitialBoardUpdated).mockResolvedValue(
      () => {},
    );
  });

  it("初期状態で initialBoard は null", () => {
    const { result } = renderHook(() => useInitialBoard(), { wrapper });

    expect(result.current.initialBoard).toBeNull();
  });

  it("初期化時に getInitialBoard() を呼ぶ", async () => {
    renderHook(() => useInitialBoard(), { wrapper });

    await waitFor(() => {
      expect(api.initialBoard.getInitialBoard).toHaveBeenCalledTimes(1);
    });
  });

  it("初期化時に onInitialBoardUpdated を購読する", async () => {
    renderHook(() => useInitialBoard(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onInitialBoardUpdated).toHaveBeenCalledTimes(1);
    });
  });

  it("getInitialBoard() が board を返した場合 initialBoard に反映される", async () => {
    const board = makeInitialBoard();
    vi.mocked(api.initialBoard.getInitialBoard).mockResolvedValue(board);

    const { result } = renderHook(() => useInitialBoard(), { wrapper });

    await waitFor(() => {
      expect(result.current.initialBoard).toEqual(board);
    });
  });

  it("onInitialBoardUpdated のコールバックが呼ばれると initialBoard が更新される", async () => {
    let capturedCb: ((board: TexasHoldemInitialBoard) => void) | undefined;
    vi.mocked(api.notifications.onInitialBoardUpdated).mockImplementation(
      async (cb) => {
        capturedCb = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useInitialBoard(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onInitialBoardUpdated).toHaveBeenCalledTimes(1);
    });

    const updatedBoard = makeInitialBoard({ handNumber: 2 });
    act(() => {
      capturedCb?.(updatedBoard);
    });

    await waitFor(() => {
      expect(result.current.initialBoard).toEqual(updatedBoard);
    });
  });

  it("アンマウント時に unlisten が呼ばれる", async () => {
    const unsubscribe = vi.fn();
    vi.mocked(api.notifications.onInitialBoardUpdated).mockResolvedValue(
      unsubscribe,
    );

    const { unmount } = renderHook(() => useInitialBoard(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onInitialBoardUpdated).toHaveBeenCalledTimes(1);
    });

    unmount();

    await waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it("アンマウント後に onInitialBoardUpdated コールバックが発火しても initialBoard が更新されない", async () => {
    let capturedCb: ((board: TexasHoldemInitialBoard) => void) | undefined;
    vi.mocked(api.notifications.onInitialBoardUpdated).mockImplementation(
      async (cb) => {
        capturedCb = cb;
        return () => {};
      },
    );

    const { result, unmount } = renderHook(() => useInitialBoard(), {
      wrapper,
    });

    // コールバックが登録されるまで待つ
    await waitFor(() => {
      expect(api.notifications.onInitialBoardUpdated).toHaveBeenCalledTimes(1);
    });

    // アンマウント (cancelled = true になる)
    unmount();

    // アンマウント後にコールバックを発火
    const updatedBoard = makeInitialBoard({ handNumber: 99 });
    act(() => {
      capturedCb?.(updatedBoard);
    });

    // cancelled フラグにより setInitialBoard は呼ばれず、initialBoard は null のまま
    expect(result.current.initialBoard).toBeNull();
  });

  it("getInitialBoard() resolve 前にアンマウントしても setInitialBoard が呼ばれない", async () => {
    let resolveBoard!: (board: TexasHoldemInitialBoard) => void;
    vi.mocked(api.initialBoard.getInitialBoard).mockReturnValue(
      new Promise<TexasHoldemInitialBoard>((resolve) => {
        resolveBoard = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useInitialBoard(), {
      wrapper,
    });

    // unmount 前は null のまま
    expect(result.current.initialBoard).toBeNull();

    // アンマウント (cancelled = true になる)
    unmount();

    // アンマウント後に Promise を resolve
    const board = makeInitialBoard({ handNumber: 99 });
    await act(async () => {
      resolveBoard(board);
      // microtask を flush して .then() コールバックが実行されるのを待つ
      await Promise.resolve();
    });

    // cancelled フラグにより setInitialBoard は呼ばれず、initialBoard は null のまま
    expect(result.current.initialBoard).toBeNull();
  });
});
