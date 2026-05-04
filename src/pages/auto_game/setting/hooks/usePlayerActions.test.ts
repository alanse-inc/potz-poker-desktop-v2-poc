import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../../contexts/auto_mode_initialize_board_command_context",
  () => ({
    useAutoModeInitializeBoardCommand: vi.fn(),
  }),
);

import { useAutoModeInitializeBoardCommand } from "../../../../contexts/auto_mode_initialize_board_command_context";
import { usePlayerActions } from "./usePlayerActions";

describe("usePlayerActions", () => {
  const mockUpdatePlayer = vi.fn().mockResolvedValue(undefined);
  const mockDeletePlayer = vi.fn();

  const makePlayers = () => [
    { id: "p1", name: "Player 1", seat: 1 as const, position: "btn" as const },
    { id: "p2", name: "Player 2", seat: 2 as const, position: "bb" as const },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAutoModeInitializeBoardCommand).mockReturnValue({
      initializeBoardCommand: {
        kind: "initializeBoard",
        input: {
          players: makePlayers(),
          setting: { mode: "auto", name: "TEST" },
        },
      },
      isStartable: true,
      updateInitializeBoardSetting: vi.fn(),
      updatePlayer: mockUpdatePlayer,
      deletePlayer: mockDeletePlayer,
      setBtnPosition: vi.fn(),
    });
  });

  it("初期状態でselectedSeatがnullである", () => {
    const { result } = renderHook(() => usePlayerActions());
    expect(result.current.selectedSeat).toBeNull();
  });

  it("onClickSeatで選択された座席がセットされる", () => {
    const { result } = renderHook(() => usePlayerActions());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });
    expect(result.current.selectedSeat).toBe(1);
  });

  it("選択された座席のプレイヤーがselectedPlayerに設定される", () => {
    const { result } = renderHook(() => usePlayerActions());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });
    expect(result.current.selectedPlayer).toBeDefined();
    expect(result.current.selectedPlayer?.id).toBe("p1");
  });

  it("onCancelで選択がクリアされる", () => {
    const { result } = renderHook(() => usePlayerActions());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });
    act(() => {
      result.current.playerActionHandlers.onCancel();
    });
    expect(result.current.selectedSeat).toBeNull();
  });

  it("onJoinでupdatePlayerが呼ばれる", async () => {
    const { result } = renderHook(() => usePlayerActions());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(3);
    });

    await act(async () => {
      await result.current.playerActionHandlers.onJoin({
        name: "New Player",
        playerId: "p3",
      });
    });

    expect(mockUpdatePlayer).toHaveBeenCalledTimes(1);
    expect(mockUpdatePlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "p3",
        name: "New Player",
        seat: 3,
      }),
    );
    expect(result.current.selectedSeat).toBeNull();
  });

  it("onJoinで名前なしの場合は何もしない", async () => {
    const { result } = renderHook(() => usePlayerActions());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });

    await act(async () => {
      await result.current.playerActionHandlers.onJoin({});
    });

    expect(mockUpdatePlayer).not.toHaveBeenCalled();
  });

  it("onDeleteでdeletePlayerが呼ばれる", () => {
    const { result } = renderHook(() => usePlayerActions());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });
    act(() => {
      result.current.playerActionHandlers.onDelete();
    });
    expect(mockDeletePlayer).toHaveBeenCalledWith("p1");
    expect(result.current.selectedSeat).toBeNull();
  });

  it("selectedPlayerがない場合onDeleteは何もしない", () => {
    const { result } = renderHook(() => usePlayerActions());
    act(() => {
      result.current.playerActionHandlers.onDelete();
    });
    expect(mockDeletePlayer).not.toHaveBeenCalled();
  });

  it("onJoinでplayerIdなしの場合はゲストIDが使われる", async () => {
    vi.mocked(useAutoModeInitializeBoardCommand).mockReturnValue({
      initializeBoardCommand: {
        kind: "initializeBoard",
        input: {
          players: [],
          setting: { mode: "auto", name: "TEST" },
        },
      },
      isStartable: false,
      updateInitializeBoardSetting: vi.fn(),
      updatePlayer: mockUpdatePlayer,
      deletePlayer: mockDeletePlayer,
      setBtnPosition: vi.fn(),
    });

    const { result } = renderHook(() => usePlayerActions());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(5);
    });

    await act(async () => {
      await result.current.playerActionHandlers.onJoin({ name: "Guest" });
    });

    expect(mockUpdatePlayer).toHaveBeenCalledTimes(1);
    const callArg = mockUpdatePlayer.mock.calls[0][0];
    // ゲストIDが割り当てられている（RESERVED_GUEST_PLAYER_IDS の先頭）
    expect(callArg.id).toBe("0000000000000000");
  });
});
