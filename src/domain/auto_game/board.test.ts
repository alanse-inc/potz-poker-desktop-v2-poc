/**
 * Auto Game ボードドメインロジックのテスト
 */

import { describe, expect, it } from "vitest";
import { determineAutoNextCardPosition, updatePlayerHand } from "./board";
import type { AutoModeBoard, AutoModePlayer, Card } from "./types";

function makeCard(suit: Card["suit"], value: Card["value"]): Card {
  return { suit, value };
}

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
    setting: { name: "test" },
    players,
    communityCards: [],
    burnCards: [],
    handNumber: 1,
    winners: null,
  };
}

describe("updatePlayerHand", () => {
  it("0枚 → 1枚目スキャンで 1 枚になる", () => {
    const board = makeBoard([makePlayer({ id: "p1", seat: 1, hand: [] })]);
    const card = makeCard("spade", "A");
    const result = updatePlayerHand(board, 1, card);
    const p = result.players.find((p) => p.seat === 1);
    expect(p?.hand).toHaveLength(1);
    expect(p?.hand[0]).toEqual(card);
  });

  it("1枚 → 2枚目スキャンで 2 枚になる", () => {
    const firstCard = makeCard("spade", "A");
    const secondCard = makeCard("heart", "K");
    const board = makeBoard([
      makePlayer({ id: "p1", seat: 1, hand: [firstCard] }),
    ]);
    const result = updatePlayerHand(board, 1, secondCard);
    const p = result.players.find((p) => p.seat === 1);
    expect(p?.hand).toHaveLength(2);
    expect(p?.hand).toEqual([firstCard, secondCard]);
  });

  it("2枚確定済み → 3枚目スキャンを試みても hand が変わらない", () => {
    const firstCard = makeCard("spade", "A");
    const secondCard = makeCard("heart", "K");
    const thirdCard = makeCard("diamond", "Q");
    const board = makeBoard([
      makePlayer({ id: "p1", seat: 1, hand: [firstCard, secondCard] }),
    ]);
    const result = updatePlayerHand(board, 1, thirdCard);
    expect(result).toBe(board);
    const p = result.players.find((p) => p.seat === 1);
    expect(p?.hand).toHaveLength(2);
    expect(p?.hand).toEqual([firstCard, secondCard]);
  });
});

describe("determineAutoNextCardPosition", () => {
  it("hand 未配布プレイヤーがいる場合は最小 seat への PlayerHand を返す", () => {
    const board = makeBoard([
      makePlayer({ id: "p1", seat: 1, hand: [] }),
      makePlayer({ id: "p2", seat: 2, hand: [] }),
    ]);
    const pos = determineAutoNextCardPosition(board);
    expect(pos).toEqual({ type: "playerHand", seat: 1 });
  });

  it("全員 2 枚配布済み・バーン 0 枚・コミュニティ 0 枚 → BurnCard", () => {
    const card = makeCard("spade", "A");
    const card2 = makeCard("heart", "K");
    const board = makeBoard([
      makePlayer({ id: "p1", seat: 1, hand: [card, card2] }),
      makePlayer({ id: "p2", seat: 2, hand: [card, card2] }),
    ]);
    const pos = determineAutoNextCardPosition(board);
    expect(pos).toEqual({ type: "burnCard" });
  });

  it("バーン 1 枚・コミュニティ 0 枚 → CommunityCard slot 0 (flop1)", () => {
    const card = makeCard("spade", "A");
    const card2 = makeCard("heart", "K");
    const board: AutoModeBoard = {
      ...makeBoard([makePlayer({ id: "p1", seat: 1, hand: [card, card2] })]),
      burnCards: [card],
    };
    const pos = determineAutoNextCardPosition(board);
    expect(pos).toEqual({ type: "communityCard", slot: 0 });
  });

  it("コミュニティ 3 枚・バーン 1 枚 → BurnCard (ターン前バーン)", () => {
    const card = makeCard("spade", "A");
    const card2 = makeCard("heart", "K");
    const board: AutoModeBoard = {
      ...makeBoard([makePlayer({ id: "p1", seat: 1, hand: [card, card2] })]),
      communityCards: [card, card, card],
      burnCards: [card],
    };
    const pos = determineAutoNextCardPosition(board);
    expect(pos).toEqual({ type: "burnCard" });
  });

  it("コミュニティ 3 枚・バーン 2 枚 → CommunityCard slot 3 (turn)", () => {
    const card = makeCard("spade", "A");
    const card2 = makeCard("heart", "K");
    const board: AutoModeBoard = {
      ...makeBoard([makePlayer({ id: "p1", seat: 1, hand: [card, card2] })]),
      communityCards: [card, card, card],
      burnCards: [card, card],
    };
    const pos = determineAutoNextCardPosition(board);
    expect(pos).toEqual({ type: "communityCard", slot: 3 });
  });

  it("全カード配布済み (コミュニティ 5 枚) → null", () => {
    const card = makeCard("spade", "A");
    const card2 = makeCard("heart", "K");
    const board: AutoModeBoard = {
      ...makeBoard([makePlayer({ id: "p1", seat: 1, hand: [card, card2] })]),
      communityCards: [card, card, card, card, card],
      burnCards: [card, card, card],
    };
    const pos = determineAutoNextCardPosition(board);
    expect(pos).toBeNull();
  });
});
