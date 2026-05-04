import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAutoPlayerManagement } from "./useAutoPlayerManagement";

describe("useAutoPlayerManagement", () => {
  it("初期状態でプレイヤーが空である", () => {
    const { result } = renderHook(() => useAutoPlayerManagement());
    expect(result.current.players).toEqual([]);
    expect(result.current.selectedSeat).toBeNull();
    expect(result.current.selectedPlayer).toBeUndefined();
  });

  it("onClickSeatで座席が選択される", () => {
    const { result } = renderHook(() => useAutoPlayerManagement());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(3);
    });
    expect(result.current.selectedSeat).toBe(3);
  });

  it("onJoinで新規プレイヤーが追加される", async () => {
    const { result } = renderHook(() => useAutoPlayerManagement());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(2);
    });

    await act(async () => {
      await result.current.playerActionHandlers.onJoin({
        name: "Alice",
        playerId: "p1",
      });
    });

    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0]).toMatchObject({
      id: "p1",
      name: "Alice",
      seat: 2,
      action: null,
      hand: [],
      odds: null,
    });
    expect(result.current.selectedSeat).toBeNull();
  });

  it("onJoinで既存プレイヤーが更新される", async () => {
    const { result } = renderHook(() => useAutoPlayerManagement());

    // 最初のプレイヤーを追加
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });
    await act(async () => {
      await result.current.playerActionHandlers.onJoin({
        name: "Alice",
        playerId: "p1",
      });
    });

    // 同じ座席に上書き
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });
    await act(async () => {
      await result.current.playerActionHandlers.onJoin({
        name: "Bob",
        playerId: "p2",
      });
    });

    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0]).toMatchObject({
      id: "p2",
      name: "Bob",
      seat: 1,
    });
  });

  it("onCancelで選択がクリアされる", () => {
    const { result } = renderHook(() => useAutoPlayerManagement());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(5);
    });
    act(() => {
      result.current.playerActionHandlers.onCancel();
    });
    expect(result.current.selectedSeat).toBeNull();
  });

  it("onDeleteで選択プレイヤーが削除される", async () => {
    const { result } = renderHook(() => useAutoPlayerManagement());

    // プレイヤーを追加
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });
    await act(async () => {
      await result.current.playerActionHandlers.onJoin({
        name: "Alice",
        playerId: "p1",
      });
    });
    act(() => {
      result.current.playerActionHandlers.onClickSeat(2);
    });
    await act(async () => {
      await result.current.playerActionHandlers.onJoin({
        name: "Bob",
        playerId: "p2",
      });
    });

    // p1 を選択して削除
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });
    act(() => {
      result.current.playerActionHandlers.onDelete();
    });

    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0].id).toBe("p2");
    expect(result.current.selectedSeat).toBeNull();
  });

  it("onSetBtnPositionで指定した座席のプレイヤーがbtnになる", async () => {
    const { result } = renderHook(() => useAutoPlayerManagement());

    // 2人追加
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });
    await act(async () => {
      await result.current.playerActionHandlers.onJoin({
        name: "Alice",
        playerId: "p1",
      });
    });
    act(() => {
      result.current.playerActionHandlers.onClickSeat(2);
    });
    await act(async () => {
      await result.current.playerActionHandlers.onJoin({
        name: "Bob",
        playerId: "p2",
      });
    });

    act(() => {
      result.current.onSetBtnPosition(1);
    });

    const p1 = result.current.players.find((p) => p.seat === 1);
    const p2 = result.current.players.find((p) => p.seat === 2);
    expect(p1?.position).toBe("btn");
    expect(p2?.position).toBeNull();
  });

  it("ゲストIDがない場合onJoinでplayerIdが割り当てられる", async () => {
    const { result } = renderHook(() => useAutoPlayerManagement());
    act(() => {
      result.current.playerActionHandlers.onClickSeat(1);
    });

    await act(async () => {
      await result.current.playerActionHandlers.onJoin({ name: "Guest" });
    });

    expect(result.current.players).toHaveLength(1);
    // ゲストIDが割り当てられている
    expect(result.current.players[0].id).toBe("0000000000000000");
  });
});
