/**
 * Auto Game Fold ワークフローのテスト
 */

import { describe, expect, it } from "vitest";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../domain/auto_game/types";
import { executeFold, executeUnfold } from "./fold";

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

function makeBoard(players: AutoModePlayer[]): AutoModeBoard {
  return {
    setting: { name: "TEST" },
    players,
    communityCards: [],
    burnCards: [],
    handNumber: 1,
    winners: null,
  };
}

describe("executeFold", () => {
  it("プレイヤーを fold 状態にする", () => {
    const board = makeBoard([
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2 }),
    ]);
    const result = executeFold(board, "p1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const p1 = result.board.players.find((p) => p.id === "p1");
      expect(p1?.action).toBe("fold");
    }
  });

  it("存在しないプレイヤー ID はエラー", () => {
    const board = makeBoard([makePlayer({ id: "p1", seat: 1 })]);
    const result = executeFold(board, "nonexistent");
    expect(result.ok).toBe(false);
  });
});

describe("executeUnfold", () => {
  it("fold 状態のプレイヤーの fold を解除する", () => {
    const board = makeBoard([
      makePlayer({ id: "p1", seat: 1, action: "fold" }),
      makePlayer({ id: "p2", seat: 2 }),
    ]);
    const result = executeUnfold(board, "p1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const p1 = result.board.players.find((p) => p.id === "p1");
      expect(p1?.action).toBeNull();
    }
  });

  it("fold していないプレイヤーの unfold は変更なし", () => {
    const board = makeBoard([makePlayer({ id: "p1", seat: 1, action: null })]);
    const result = executeUnfold(board, "p1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const p1 = result.board.players.find((p) => p.id === "p1");
      expect(p1?.action).toBeNull();
    }
  });
});
