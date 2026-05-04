import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../../domain/auto_game/types";
import { useAutoPlayerDisplayHelpers } from "./useAutoPlayerDisplayHelpers";

function makePlayer(overrides: Partial<AutoModePlayer> = {}): AutoModePlayer {
  return {
    id: "player-1",
    name: "Alice",
    icon: null,
    seat: 1,
    position: null,
    action: null,
    hand: [
      { suit: "spade", value: "A" },
      { suit: "heart", value: "K" },
    ],
    odds: 0.6,
    ...overrides,
  };
}

function makeBoard(overrides: Partial<AutoModeBoard> = {}): AutoModeBoard {
  return {
    setting: { name: "Test Game" },
    players: [],
    communityCards: [],
    burnCards: [],
    handNumber: 1,
    winners: null,
    ...overrides,
  };
}

describe("useAutoPlayerDisplayHelpers", () => {
  describe("odds", () => {
    it("odds を % 表示に変換する", () => {
      const player = makePlayer({ odds: 0.6 });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player, board: makeBoard() }),
      );
      expect(result.current.odds).toBe("60.0%");
    });

    it("odds が null のときは null を返す", () => {
      const player = makePlayer({ odds: null });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player, board: makeBoard() }),
      );
      expect(result.current.odds).toBeNull();
    });

    it("リバー(5枚)のときは odds を非表示 (null)", () => {
      const player = makePlayer({ odds: 0.5 });
      const board = makeBoard({
        communityCards: [
          { suit: "spade", value: "A" },
          { suit: "heart", value: "K" },
          { suit: "club", value: "Q" },
          { suit: "diamond", value: "J" },
          { suit: "spade", value: "T" },
        ],
      });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player, board }),
      );
      expect(result.current.odds).toBeNull();
    });
  });

  describe("isFolded", () => {
    it("action が fold のときは true", () => {
      const player = makePlayer({ action: "fold" });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player }),
      );
      expect(result.current.isFolded).toBe(true);
    });

    it("action が null のときは false", () => {
      const player = makePlayer({ action: null });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player }),
      );
      expect(result.current.isFolded).toBe(false);
    });
  });

  describe("position", () => {
    it.each([
      ["btn", "BTN"],
      ["btn_sb", "BTN/SB"],
      ["bb", "BB"],
      ["sb", "SB"],
      ["utg", "UTG"],
      ["utg_plus_1", "+1"],
      ["utg_plus_2", "+2"],
      ["utg_plus_3", "+3"],
      ["mp", "MP"],
      ["hj", "HJ"],
      ["co", "CO"],
    ] as const)("position %s → %s", (pos, expected) => {
      const player = makePlayer({ position: pos });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player }),
      );
      expect(result.current.position).toBe(expected);
    });

    it("position が null のときは null", () => {
      const player = makePlayer({ position: null });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player }),
      );
      expect(result.current.position).toBeNull();
    });
  });

  describe("isWinner", () => {
    it("リバー後かつ勝者リストに含まれる場合 true", () => {
      const player = makePlayer({ id: "player-1", action: null });
      const board = makeBoard({
        communityCards: [
          { suit: "spade", value: "A" },
          { suit: "heart", value: "K" },
          { suit: "club", value: "Q" },
          { suit: "diamond", value: "J" },
          { suit: "spade", value: "T" },
        ],
        winners: ["player-1"],
      });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player, board }),
      );
      expect(result.current.isWinner).toBe(true);
    });

    it("フォールドプレイヤーは winners に含まれても false", () => {
      const player = makePlayer({ id: "player-1", action: "fold" });
      const board = makeBoard({
        communityCards: [
          { suit: "spade", value: "A" },
          { suit: "heart", value: "K" },
          { suit: "club", value: "Q" },
          { suit: "diamond", value: "J" },
          { suit: "spade", value: "T" },
        ],
        winners: ["player-1"],
      });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player, board }),
      );
      expect(result.current.isWinner).toBe(false);
    });

    it("リバー前は false", () => {
      const player = makePlayer({ id: "player-1" });
      const board = makeBoard({
        communityCards: [
          { suit: "spade", value: "A" },
          { suit: "heart", value: "K" },
          { suit: "club", value: "Q" },
        ],
        winners: ["player-1"],
      });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player, board }),
      );
      expect(result.current.isWinner).toBe(false);
    });

    it("board が undefined のときは false", () => {
      const player = makePlayer({ id: "player-1" });
      const { result } = renderHook(() =>
        useAutoPlayerDisplayHelpers({ player }),
      );
      expect(result.current.isWinner).toBe(false);
    });
  });
});
