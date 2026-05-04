import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoModeBoard } from "../../../../domain/auto_game/types";

// Mock dependencies
vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../../../contexts/auto_board_context", () => ({
  useAutoBoard: vi.fn(),
}));

vi.mock("../../../../contexts/telop_context", () => ({
  useTelop: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import toast from "react-hot-toast";
import { useAutoBoard } from "../../../../contexts/auto_board_context";
import { useTelop } from "../../../../contexts/telop_context";
import { useGameActions } from "./useGameActions";

function makeBoard(
  players: Array<{
    id: string;
    seat: number;
    position?: string | null;
    action?: string | null;
  }>,
): AutoModeBoard {
  return {
    setting: { name: "TEST" },
    players: players.map((p) => ({
      id: p.id,
      name: `Player ${p.id}`,
      icon: null,
      seat: p.seat,
      position: (p.position ??
        null) as AutoModeBoard["players"][number]["position"],
      action: (p.action ?? null) as AutoModeBoard["players"][number]["action"],
      hand: [],
      odds: null,
    })),
    communityCards: [],
    burnCards: [],
    handNumber: 1,
    winners: null,
  };
}

describe("useGameActions", () => {
  const mockSetBoard = vi.fn();
  const mockResetBoard = vi.fn();
  const mockSetIsOpen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAutoBoard).mockReturnValue({
      board: makeBoard([
        { id: "p1", seat: 1, position: "btn" },
        { id: "p2", seat: 2, position: "sb" },
        { id: "p3", seat: 3, position: "bb" },
      ]),
      setBoard: mockSetBoard,
      resetBoard: mockResetBoard,
    });

    vi.mocked(useTelop).mockReturnValue({
      isOpen: false,
      setIsOpen: mockSetIsOpen,
      telopId: "modern",
      setTelopId: vi.fn(),
      backgroundColor: "#00ff00",
      setBackgroundColor: vi.fn(),
      currentScreen: null,
      setCurrentScreen: vi.fn(),
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    children as React.ReactElement;

  it("初期状態でisExitModalOpenがfalseである", () => {
    const { result } = renderHook(() => useGameActions(), { wrapper });
    expect(result.current.isExitModalOpen).toBe(false);
  });

  it("onOpenExitModalでモーダルが開く", () => {
    const { result } = renderHook(() => useGameActions(), { wrapper });
    act(() => {
      result.current.onOpenExitModal();
    });
    expect(result.current.isExitModalOpen).toBe(true);
  });

  it("onCloseExitModalでモーダルが閉じる", () => {
    const { result } = renderHook(() => useGameActions(), { wrapper });
    act(() => {
      result.current.onOpenExitModal();
    });
    act(() => {
      result.current.onCloseExitModal();
    });
    expect(result.current.isExitModalOpen).toBe(false);
  });

  it("onExitToEditでresetBoardが呼ばれる", () => {
    const { result } = renderHook(() => useGameActions(), { wrapper });
    act(() => {
      result.current.onExitToEdit();
    });
    expect(mockResetBoard).toHaveBeenCalledTimes(1);
  });

  it("onNextGameでsetBoardが呼ばれる（ボードあり）", () => {
    const { result } = renderHook(() => useGameActions(), { wrapper });
    act(() => {
      result.current.onNextGame();
    });
    expect(mockSetBoard).toHaveBeenCalledTimes(1);
    const newBoard = mockSetBoard.mock.calls[0][0] as AutoModeBoard;
    expect(newBoard.handNumber).toBe(2);
  });

  it("ボードがない場合はonNextGameがtoast.errorを出す", () => {
    vi.mocked(useAutoBoard).mockReturnValue({
      board: null,
      setBoard: mockSetBoard,
      resetBoard: mockResetBoard,
    });
    const { result } = renderHook(() => useGameActions(), { wrapper });
    act(() => {
      result.current.onNextGame();
    });
    expect(mockSetBoard).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "ボードが初期化されていません",
    );
  });

  it("onPlayerCardPressのシングルクリックでfoldが実行される", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useGameActions(), { wrapper });

    act(() => {
      result.current.onPlayerCardPress("p1");
    });

    // タイマーを進めてfold確定
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(mockSetBoard).toHaveBeenCalled();
    const calledBoard = mockSetBoard.mock.calls[0][0] as AutoModeBoard;
    const p1 = calledBoard.players.find((p) => p.id === "p1");
    expect(p1?.action).toBe("fold");

    vi.useRealTimers();
  });

  it("onPlayerCardPressのダブルクリックでunfoldが実行される", async () => {
    vi.useFakeTimers();

    vi.mocked(useAutoBoard).mockReturnValue({
      board: makeBoard([
        { id: "p1", seat: 1, position: "btn", action: "fold" },
        { id: "p2", seat: 2, position: "sb" },
        { id: "p3", seat: 3, position: "bb" },
      ]),
      setBoard: mockSetBoard,
      resetBoard: mockResetBoard,
    });

    const { result } = renderHook(() => useGameActions(), { wrapper });

    // ダブルクリック（2回クリック、タイマー期限前に2回目）
    act(() => {
      result.current.onPlayerCardPress("p1");
    });
    act(() => {
      result.current.onPlayerCardPress("p1");
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(mockSetBoard).toHaveBeenCalled();
    const calledBoard = mockSetBoard.mock.calls[0][0] as AutoModeBoard;
    const p1 = calledBoard.players.find((p) => p.id === "p1");
    expect(p1?.action).toBeNull();

    vi.useRealTimers();
  });

  it("isTelopOpenがtelopコンテキストのisOpenと一致する", () => {
    vi.mocked(useTelop).mockReturnValue({
      isOpen: true,
      setIsOpen: mockSetIsOpen,
      telopId: "modern",
      setTelopId: vi.fn(),
      backgroundColor: "#00ff00",
      setBackgroundColor: vi.fn(),
      currentScreen: null,
      setCurrentScreen: vi.fn(),
    });

    const { result } = renderHook(() => useGameActions(), { wrapper });
    expect(result.current.isTelopOpen).toBe(true);
  });
});
