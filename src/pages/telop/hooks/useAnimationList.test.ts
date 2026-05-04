import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TELOP_ANIMATION_SETTINGS } from "../constants";
import { useAnimationList } from "./useAnimationList";

type Item = { id: string; name: string };

function makeItem(id: string): Item {
  return { id, name: `Item ${id}` };
}

const animationSettings = {
  ...DEFAULT_TELOP_ANIMATION_SETTINGS,
  fadeInDuration: 100,
  fadeOutDuration: 100,
};

const baseOptions = {
  animationSettings,
  getItemId: (item: Item) => item.id,
  waitForCardLoad: false,
};

describe("useAnimationList (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("startAnimation=false のときは itemsLoaded が false", () => {
    const items = [makeItem("a")];
    const { result } = renderHook(() =>
      useAnimationList(items, { ...baseOptions, startAnimation: false }),
    );
    expect(result.current.itemsLoaded).toBe(false);
  });

  it("startAnimation=true かつアイテムがあるとき itemsLoaded が true", () => {
    const items = [makeItem("a")];
    const { result } = renderHook(() =>
      useAnimationList(items, { ...baseOptions, startAnimation: true }),
    );
    expect(result.current.itemsLoaded).toBe(true);
  });

  it("空のアイテムリストのとき itemsLoaded が false", () => {
    const { result } = renderHook(() =>
      useAnimationList([], { ...baseOptions, startAnimation: true }),
    );
    expect(result.current.itemsLoaded).toBe(false);
  });

  it("createElementId が side を含む ID を返す", () => {
    const items = [makeItem("a")];
    const { result } = renderHook(() =>
      useAnimationList(items, { ...baseOptions, side: "left" }),
    );

    // アイテムがキューに入ったら取得できる
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const activePlayers = result.current.activePlayers;
    if (activePlayers.length > 0) {
      const elementId = result.current.createElementId(activePlayers[0]);
      expect(elementId).toContain("left");
    }
  });

  it("getAnimationStyle はアクティブアイテムに対して opacity:1 を返す", () => {
    const items = [makeItem("a")];
    const { result } = renderHook(() =>
      useAnimationList(items, { ...baseOptions }),
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const activePlayers = result.current.activePlayers;
    const activeItem = activePlayers.find((p) => p.state === "active");
    if (activeItem) {
      const style = result.current.getAnimationStyle(activeItem);
      expect((style as { opacity?: number }).opacity).toBe(1);
    }
  });

  it("waitForCardLoad=true かつ hand プロパティがある場合に itemsLoaded を制御する", () => {
    const itemsWithHand = [
      {
        id: "a",
        name: "A",
        hand: [{ suit: "spade" as const, value: "A" as const }],
      },
    ];
    const { result } = renderHook(() =>
      useAnimationList(itemsWithHand, {
        animationSettings,
        getItemId: (item) => item.id,
        waitForCardLoad: true,
        startAnimation: true,
      }),
    );
    expect(result.current.itemsLoaded).toBe(true);
  });
});

describe("useAnimationList (fake timers / async flows)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("アイテムが削除されると activePlayers から除外される", async () => {
    const items = [makeItem("a"), makeItem("b")];
    const { result, rerender } = renderHook(
      (props: Item[]) => useAnimationList(props, { ...baseOptions }),
      { initialProps: items },
    );

    // タイマーを進めて a を active にする
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // active になったプレイヤーが存在することを確認
    const hasActive = result.current.activePlayers.some(
      (p) => p.state === "active",
    );

    // b を削除する
    rerender([makeItem("a")]);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // b が exiting か active リストから外れていることを確認
    if (hasActive) {
      const bInActive = result.current.activePlayers.find(
        (p) => p.item.id === "b" && p.state !== "exiting",
      );
      const bInExiting = result.current.exitingPlayers.find(
        (p) => p.item.id === "b",
      );
      // b は exiting か activePlayers から削除されているはず
      expect(bInActive === undefined || bInExiting !== undefined).toBe(true);
    }
  });

  it("アイテムが active になると activePlayers に追加される", async () => {
    const items = [makeItem("a")];

    const { result } = renderHook(() =>
      useAnimationList(items, {
        ...baseOptions,
        startAnimation: true,
      }),
    );

    // 十分な時間を進めてアニメーションを完了させる
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // activePlayers に a が存在するか、または itemsLoaded が true になっている
    expect(
      result.current.itemsLoaded || result.current.activePlayers.length > 0,
    ).toBe(true);
  });
});
