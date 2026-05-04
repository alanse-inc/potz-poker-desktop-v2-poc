/**
 * Auto Game Move Next Game ワークフローのテスト
 */

import { describe, expect, it } from "vitest";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../domain/auto_game/types";
import { moveNextGame } from "./move_next_game";

function makePlayer(
  overrides: Partial<AutoModePlayer> & { id: string; seat: number },
): AutoModePlayer {
  return {
    name: "Player",
    icon: null,
    position: null,
    action: null,
    hand: [],
    odds: null,
    ...overrides,
  };
}

function makeBoard(players: AutoModePlayer[], handNumber = 1): AutoModeBoard {
  return {
    setting: { name: "TEST" },
    players,
    communityCards: [],
    burnCards: [],
    handNumber,
    winners: null,
  };
}

describe("moveNextGame", () => {
  it("ハンド番号をインクリメントする", () => {
    const board = makeBoard(
      [
        makePlayer({ id: "p1", seat: 1, position: "btn" }),
        makePlayer({ id: "p2", seat: 2, position: "bb" }),
      ],
      3,
    );
    const result = moveNextGame(board);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.board.handNumber).toBe(4);
    }
  });

  it("プレイヤーのアクションと手札がリセットされる", () => {
    const board = makeBoard([
      makePlayer({
        id: "p1",
        seat: 1,
        position: "btn",
        action: "fold",
        hand: [
          { suit: "spade", value: "A" },
          { suit: "heart", value: "K" },
        ],
      }),
      makePlayer({ id: "p2", seat: 2, position: "bb" }),
    ]);
    const result = moveNextGame(board);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const player of result.board.players) {
        expect(player.action).toBeNull();
        expect(player.hand).toEqual([]);
        expect(player.odds).toBeNull();
      }
    }
  });

  it("BTN が次のプレイヤーに移動する", () => {
    const board = makeBoard([
      makePlayer({ id: "p1", seat: 1, position: "btn" }),
      makePlayer({ id: "p2", seat: 2, position: "sb" }),
      makePlayer({ id: "p3", seat: 3, position: "bb" }),
    ]);
    const result = moveNextGame(board);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 前の BTN は p1 (seat 1)、次の BTN は p2 (seat 2)
      const nextBtn = result.board.players.find(
        (p) => p.position === "btn" || p.position === "btn_sb",
      );
      expect(nextBtn?.id).toBe("p2");
    }
  });
});
