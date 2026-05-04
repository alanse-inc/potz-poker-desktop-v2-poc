import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/auto-game/setting", state: null }),
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

vi.mock("../../../../contexts/telop_context", () => ({
  useTelop: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import { useAutoBoard } from "../../../../contexts/auto_board_context";
import { useAutoModeInitializeBoardCommand } from "../../../../contexts/auto_mode_initialize_board_command_context";
import { useSession } from "../../../../contexts/session_context";
import { useTelop } from "../../../../contexts/telop_context";
import { useAutoGameSetting } from "./useAutoGameSetting";

const mockNavigate = vi.fn();

describe("useAutoGameSetting", () => {
  const mockSetBoard = vi.fn();
  const mockSetBtnPosition = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAutoBoard).mockReturnValue({
      board: null,
      setBoard: mockSetBoard,
      resetBoard: vi.fn(),
    });

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
              position: "bb" as const,
            },
          ],
          setting: { mode: "auto" as const, name: "TEST GAME" },
        },
      },
      isStartable: true,
      updateInitializeBoardSetting: vi.fn(),
      updatePlayer: vi.fn(),
      deletePlayer: vi.fn(),
      setBtnPosition: mockSetBtnPosition,
    });

    vi.mocked(useSession).mockReturnValue({
      currentSession: null,
      setCurrentSession: vi.fn(),
      currentGameSessionId: null,
      setCurrentGameSessionId: vi.fn(),
      lastHandNumber: 0,
      setLastHandNumber: vi.fn(),
    });

    vi.mocked(useTelop).mockReturnValue({
      isOpen: false,
      setIsOpen: vi.fn(),
      telopId: "modern",
      setTelopId: vi.fn(),
      backgroundColor: "#00ff00",
      setBackgroundColor: vi.fn(),
      currentScreen: null,
      setCurrentScreen: vi.fn(),
    });
  });

  it("settingとplayersが正しく返される", () => {
    const { result } = renderHook(() => useAutoGameSetting());
    expect(result.current.setting.name).toBe("TEST GAME");
    expect(result.current.players).toHaveLength(2);
  });

  it("isStartableが正しく返される", () => {
    const { result } = renderHook(() => useAutoGameSetting());
    expect(result.current.isStartable).toBe(true);
  });

  it("handleGameStartでsetBoardが呼ばれてナビゲートされる", async () => {
    const { result } = renderHook(() => useAutoGameSetting());

    await act(async () => {
      await result.current.handleGameStart();
    });

    expect(mockSetBoard).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/auto-game/playing");
  });

  it("isStartableがfalseの場合handleGameStartは何もしない", async () => {
    vi.mocked(useAutoModeInitializeBoardCommand).mockReturnValue({
      initializeBoardCommand: {
        kind: "initializeBoard",
        input: {
          players: [],
          setting: { mode: "auto" as const, name: "TEST" },
        },
      },
      isStartable: false,
      updateInitializeBoardSetting: vi.fn(),
      updatePlayer: vi.fn(),
      deletePlayer: vi.fn(),
      setBtnPosition: mockSetBtnPosition,
    });

    const { result } = renderHook(() => useAutoGameSetting());

    await act(async () => {
      await result.current.handleGameStart();
    });

    expect(mockSetBoard).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("handleBackで/deck/chooseへ遷移する", () => {
    const { result } = renderHook(() => useAutoGameSetting());
    act(() => {
      result.current.handleBack();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/deck/choose");
  });

  it("handleBtnButtonClickで/auto-game/select-btnへ遷移する", () => {
    const { result } = renderHook(() => useAutoGameSetting());
    act(() => {
      result.current.handleBtnButtonClick();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/auto-game/select-btn", {
      state: expect.objectContaining({ gameName: "TEST GAME" }),
    });
  });

  it("onChangeGameModeで/game/first-game/settingへ遷移する", () => {
    const { result } = renderHook(() => useAutoGameSetting());
    act(() => {
      result.current.onChangeGameMode();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/game/first-game/setting");
  });

  it("handleGameStartでボード作成時にハンド番号が正しい", async () => {
    vi.mocked(useSession).mockReturnValue({
      currentSession: null,
      setCurrentSession: vi.fn(),
      currentGameSessionId: null,
      setCurrentGameSessionId: vi.fn(),
      lastHandNumber: 4,
      setLastHandNumber: vi.fn(),
    });

    const { result } = renderHook(() => useAutoGameSetting());

    await act(async () => {
      await result.current.handleGameStart();
    });

    const calledBoard = mockSetBoard.mock.calls[0][0];
    expect(calledBoard.handNumber).toBe(5); // lastHandNumber(4) + 1
  });
});
