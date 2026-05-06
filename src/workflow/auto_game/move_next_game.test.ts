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
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.handNumber).toBe(4);
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
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      for (const player of result.value.players) {
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
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // 前の BTN は p1 (seat 1)、次の BTN は p2 (seat 2)
      const nextBtn = result.value.players.find(
        (p) => p.position === "btn" || p.position === "btn_sb",
      );
      expect(nextBtn?.id).toBe("p2");
    }
  });

  it("プレイヤーが空の場合はエラー (no_btn_candidate)", () => {
    // プレイヤーなし = 次の BTN を決定できない
    const board = makeBoard([]);
    const result = moveNextGame(board);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe("no_btn_candidate");
    }
  });
});
