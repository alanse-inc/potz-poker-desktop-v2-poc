import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock(
  "../../../../contexts/auto_mode_initialize_board_command_context",
  () => ({
    useAutoModeInitializeBoardCommand: vi.fn(),
  }),
);

vi.mock("../../../../contexts/telop_context", () => ({
  useTelop: vi.fn(),
}));

import { useAutoModeInitializeBoardCommand } from "../../../../contexts/auto_mode_initialize_board_command_context";
import { useTelop } from "../../../../contexts/telop_context";
import { useAutoGameSettings } from "./useAutoGameSettings";

const mockNavigate = vi.fn();

describe("useAutoGameSettings", () => {
  const mockSetCurrentScreen = vi.fn().mockResolvedValue(undefined);
  const mockSetIsOpen = vi.fn();
  const mockOpen = vi.fn().mockResolvedValue(undefined);
  const mockClose = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();

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
          setting: { mode: "auto" as const, name: "MY GAME" },
        },
      },
      isStartable: true,
      updateInitializeBoardSetting: vi.fn(),
      updatePlayer: vi.fn(),
      deletePlayer: vi.fn(),
      setBtnPosition: vi.fn(),
    });

    vi.mocked(useTelop).mockReturnValue({
      isOpen: false,
      setIsOpen: mockSetIsOpen,
      open: mockOpen,
      close: mockClose,
      telopId: "modern",
      setTelopId: vi.fn(),
      backgroundColor: "#00ff00",
      setBackgroundColor: vi.fn(),
      currentScreen: null,
      setCurrentScreen: mockSetCurrentScreen,
    });
  });

  it("settingとisStartableが返される", () => {
    const { result } = renderHook(() => useAutoGameSettings());
    expect(result.current.setting.name).toBe("MY GAME");
    expect(result.current.isStartable).toBe(true);
  });

  it("マウント時にsetCurrentScreenが'auto-setting'で呼ばれる", async () => {
    renderHook(() => useAutoGameSettings());

    await waitFor(() => {
      expect(mockSetCurrentScreen).toHaveBeenCalledWith("auto-setting");
    });
  });

  it("アンマウント時にsetCurrentScreenがnullで呼ばれる", async () => {
    const { unmount } = renderHook(() => useAutoGameSettings());

    await waitFor(() => {
      expect(mockSetCurrentScreen).toHaveBeenCalledWith("auto-setting");
    });

    unmount();

    expect(mockSetCurrentScreen).toHaveBeenCalledWith(null);
  });

  it("onClickAdvancedSettingで詳細設定画面へ遷移する", () => {
    const { result } = renderHook(() => useAutoGameSettings());
    act(() => {
      result.current.onClickAdvancedSetting();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/auto-game/advanced-setting");
  });

  it("onCaptionWindowToggleでisOpenが切り替わる（openが呼ばれる）", async () => {
    const { result } = renderHook(() => useAutoGameSettings());

    await act(async () => {
      await result.current.onCaptionWindowToggle();
    });

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("isOpen=trueの場合、onCaptionWindowToggleでcloseが呼ばれる", async () => {
    vi.mocked(useTelop).mockReturnValue({
      isOpen: true,
      setIsOpen: mockSetIsOpen,
      open: mockOpen,
      close: mockClose,
      telopId: "modern",
      setTelopId: vi.fn(),
      backgroundColor: "#00ff00",
      setBackgroundColor: vi.fn(),
      currentScreen: null,
      setCurrentScreen: mockSetCurrentScreen,
    });

    const { result } = renderHook(() => useAutoGameSettings());

    await act(async () => {
      await result.current.onCaptionWindowToggle();
    });

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
