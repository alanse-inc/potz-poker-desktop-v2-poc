import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoModeBoard } from "../../../../domain/auto_game/types";

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../../../contexts/auto_board_context", () => ({
  useAutoBoard: vi.fn(),
}));

vi.mock(
  "../../../../contexts/auto_mode_initialize_board_command_context",
  () => ({
    useAutoModeInitializeBoardCommand: vi.fn(),
  }),
);

vi.mock("../../../../contexts/session_context", () => ({
  useSession: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

import toast from "react-hot-toast";
import { useAutoBoard } from "../../../../contexts/auto_board_context";
import { useAutoModeInitializeBoardCommand } from "../../../../contexts/auto_mode_initialize_board_command_context";
import { useSession } from "../../../../contexts/session_context";
import { useBoardInitialization } from "./useBoardInitialization";

const baseCommand = {
  kind: "initializeBoard" as const,
  input: {
    players: [
      {
        id: "p1",
        name: "Player 1",
        seat: 1 as const,
        position: "btn" as const,
      },
      { id: "p2", name: "Player 2", seat: 2 as const, position: "bb" as const },
    ],
    setting: { mode: "auto" as const, name: "TEST GAME" },
  },
};

describe("useBoardInitialization", () => {
  const mockSetBoard = vi.fn();
  const mockResetBoard = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAutoBoard).mockReturnValue({
      board: null,
      setBoard: mockSetBoard,
      resetBoard: mockResetBoard,
    });

    vi.mocked(useAutoModeInitializeBoardCommand).mockReturnValue({
      initializeBoardCommand: baseCommand,
      isStartable: true,
      updateInitializeBoardSetting: vi.fn(),
      updatePlayer: vi.fn(),
      deletePlayer: vi.fn(),
      setBtnPosition: vi.fn(),
    });

    vi.mocked(useSession).mockReturnValue({
      currentSession: null,
      setCurrentSession: vi.fn(),
      currentGameSessionId: null,
      setCurrentGameSessionId: vi.fn(),
      lastHandNumber: 0,
      setLastHandNumber: vi.fn(),
    });
  });

  it("ボードがない場合は初期化を実行してsetBoardを呼ぶ", async () => {
    const { result } = renderHook(() => useBoardInitialization());

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(mockSetBoard).toHaveBeenCalledTimes(1);
    const newBoard = mockSetBoard.mock.calls[0][0] as AutoModeBoard;
    expect(newBoard.setting.name).toBe("TEST GAME");
    expect(newBoard.handNumber).toBe(1); // lastHandNumber(0) + 1
    expect(newBoard.communityCards).toEqual([]);
    expect(newBoard.burnCards).toEqual([]);
    expect(newBoard.winners).toBeNull();
  });

  it("ボードが既にある場合は初期化をスキップする", async () => {
    const existingBoard: AutoModeBoard = {
      setting: { name: "EXISTING" },
      players: [],
      communityCards: [],
      burnCards: [],
      handNumber: 5,
      winners: null,
    };

    vi.mocked(useAutoBoard).mockReturnValue({
      board: existingBoard,
      setBoard: mockSetBoard,
      resetBoard: mockResetBoard,
    });

    const { result } = renderHook(() => useBoardInitialization());

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(mockSetBoard).not.toHaveBeenCalled();
    expect(result.current.board).toBe(existingBoard);
  });

  it("プレイヤーが2人未満の場合はtoast.errorを出す", async () => {
    vi.mocked(useAutoModeInitializeBoardCommand).mockReturnValue({
      initializeBoardCommand: {
        kind: "initializeBoard",
        input: {
          players: [
            { id: "p1", name: "Player 1", seat: 1 as const, position: null },
          ],
          setting: { mode: "auto" as const, name: "TEST" },
        },
      },
      isStartable: false,
      updateInitializeBoardSetting: vi.fn(),
      updatePlayer: vi.fn(),
      deletePlayer: vi.fn(),
      setBtnPosition: vi.fn(),
    });

    const { result } = renderHook(() => useBoardInitialization());

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "ボード初期化に失敗しました",
    );
    expect(mockSetBoard).not.toHaveBeenCalled();
  });

  it("BTNプレイヤーがない場合はtoast.errorを出す", async () => {
    vi.mocked(useAutoModeInitializeBoardCommand).mockReturnValue({
      initializeBoardCommand: {
        kind: "initializeBoard",
        input: {
          players: [
            { id: "p1", name: "Player 1", seat: 1 as const, position: null },
            { id: "p2", name: "Player 2", seat: 2 as const, position: null },
          ],
          setting: { mode: "auto" as const, name: "TEST" },
        },
      },
      isStartable: false,
      updateInitializeBoardSetting: vi.fn(),
      updatePlayer: vi.fn(),
      deletePlayer: vi.fn(),
      setBtnPosition: vi.fn(),
    });

    const { result } = renderHook(() => useBoardInitialization());

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "ボード初期化に失敗しました",
    );
  });

  it("ハンド番号はlastHandNumber+1から開始する", async () => {
    vi.mocked(useSession).mockReturnValue({
      currentSession: null,
      setCurrentSession: vi.fn(),
      currentGameSessionId: null,
      setCurrentGameSessionId: vi.fn(),
      lastHandNumber: 9,
      setLastHandNumber: vi.fn(),
    });

    const { result } = renderHook(() => useBoardInitialization());

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    const newBoard = mockSetBoard.mock.calls[0][0] as AutoModeBoard;
    expect(newBoard.handNumber).toBe(10); // lastHandNumber(9) + 1
  });

  it("BTNを持つプレイヤーにポジションが割り当てられる", async () => {
    vi.mocked(useAutoModeInitializeBoardCommand).mockReturnValue({
      initializeBoardCommand: {
        kind: "initializeBoard",
        input: {
          players: [
            {
              id: "p1",
              name: "Player 1",
              seat: 1 as const,
              position: "btn" as const,
            },
            {
              id: "p2",
              name: "Player 2",
              seat: 2 as const,
              position: "sb" as const,
            },
            {
              id: "p3",
              name: "Player 3",
              seat: 3 as const,
              position: "bb" as const,
            },
          ],
          setting: { mode: "auto" as const, name: "TEST" },
        },
      },
      isStartable: true,
      updateInitializeBoardSetting: vi.fn(),
      updatePlayer: vi.fn(),
      deletePlayer: vi.fn(),
      setBtnPosition: vi.fn(),
    });

    const { result } = renderHook(() => useBoardInitialization());

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    const newBoard = mockSetBoard.mock.calls[0][0] as AutoModeBoard;
    const btnPlayer = newBoard.players.find(
      (p) => p.position === "btn" || p.position === "btn_sb",
    );
    expect(btnPlayer).toBeDefined();
    expect(btnPlayer?.id).toBe("p1");
  });
});
