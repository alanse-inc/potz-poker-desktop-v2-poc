import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_TELOP_ANIMATION_SETTINGS } from "../constants";
import { usePlayerLayout } from "./usePlayerLayout";

type Player = { id: string; name: string };

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i + 1}`,
    name: `Player${i + 1}`,
  }));
}

const animationSettings = DEFAULT_TELOP_ANIMATION_SETTINGS;

describe("usePlayerLayout", () => {
  it("4人以下のときサイズが large", () => {
    const { result } = renderHook(() =>
      usePlayerLayout(makePlayers(4), { animationSettings }),
    );
    expect(result.current.size).toBe("large");
  });

  it("5人以上のときサイズが small", () => {
    const { result } = renderHook(() =>
      usePlayerLayout(makePlayers(5), { animationSettings }),
    );
    expect(result.current.size).toBe("small");
  });

  it("5人以下は全員左側", () => {
    const players = makePlayers(5);
    const { result } = renderHook(() =>
      usePlayerLayout(players, { animationSettings }),
    );
    expect(result.current.playersLeft).toHaveLength(5);
    expect(result.current.playersRight).toHaveLength(0);
  });

  it("6人のとき左5人・右1人 (maxLeftPlayers=5 デフォルト)", () => {
    const players = makePlayers(6);
    const { result } = renderHook(() =>
      usePlayerLayout(players, { animationSettings }),
    );
    expect(result.current.playersLeft).toHaveLength(5);
    expect(result.current.playersRight).toHaveLength(1);
  });

  it("maxLeftPlayers を指定できる", () => {
    const players = makePlayers(6);
    const { result } = renderHook(() =>
      usePlayerLayout(players, { animationSettings, maxLeftPlayers: 3 }),
    );
    expect(result.current.playersLeft).toHaveLength(3);
    expect(result.current.playersRight).toHaveLength(3);
  });

  it("初期状態で startRightAnimation は false", () => {
    const { result } = renderHook(() =>
      usePlayerLayout(makePlayers(6), { animationSettings }),
    );
    expect(result.current.startRightAnimation).toBe(false);
  });

  it("handleLeftAnimationComplete を呼ぶと startRightAnimation が true になる", () => {
    const { result } = renderHook(() =>
      usePlayerLayout(makePlayers(6), { animationSettings }),
    );

    act(() => {
      result.current.handleLeftAnimationComplete();
    });

    expect(result.current.startRightAnimation).toBe(true);
  });

  it("右側プレイヤーが0になると startRightAnimation が false にリセットされる", () => {
    const { result, rerender } = renderHook(
      (players: Player[]) => usePlayerLayout(players, { animationSettings }),
      { initialProps: makePlayers(6) },
    );

    act(() => {
      result.current.handleLeftAnimationComplete();
    });
    expect(result.current.startRightAnimation).toBe(true);

    // 右側がいなくなるよう 5人以下に変更
    rerender(makePlayers(4));
    expect(result.current.startRightAnimation).toBe(false);
  });
});
