import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Card } from "../../../types";
import { useCommunityCardDisplay } from "./useCommunityCardDisplay";

const makeCard = (suit: Card["suit"], value: Card["value"]): Card => ({
  suit,
  value,
});

const FLOP: Card[] = [
  makeCard("spade", "A"),
  makeCard("heart", "K"),
  makeCard("club", "Q"),
];
const TURN: Card[] = [...FLOP, makeCard("diamond", "J")];
const RIVER: Card[] = [...TURN, makeCard("spade", "T")];

describe("useCommunityCardDisplay", () => {
  it("communityCards が undefined のときは全スロット非表示", () => {
    const { result } = renderHook(() => useCommunityCardDisplay(undefined));
    expect(result.current.shouldShowSlots).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("空配列のときは全スロット非表示", () => {
    const { result } = renderHook(() => useCommunityCardDisplay([]));
    expect(result.current.shouldShowSlots).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("1枚のときはフロップ未達 → 全スロット非表示", () => {
    const { result } = renderHook(() =>
      useCommunityCardDisplay([makeCard("spade", "A")]),
    );
    expect(result.current.shouldShowSlots).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("2枚のときはフロップ未達 → 全スロット非表示", () => {
    const { result } = renderHook(() =>
      useCommunityCardDisplay([makeCard("spade", "A"), makeCard("heart", "K")]),
    );
    expect(result.current.shouldShowSlots).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("フロップ(3枚)のときスロット0-2が表示、3-4は非表示", () => {
    const { result } = renderHook(() => useCommunityCardDisplay(FLOP));
    expect(result.current.shouldShowSlots).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("ターン(4枚)のときスロット0-3が表示、4は非表示", () => {
    const { result } = renderHook(() => useCommunityCardDisplay(TURN));
    expect(result.current.shouldShowSlots).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("リバー(5枚)のとき全スロット表示", () => {
    const { result } = renderHook(() => useCommunityCardDisplay(RIVER));
    expect(result.current.shouldShowSlots).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});
