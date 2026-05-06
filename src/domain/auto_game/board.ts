/**
 * Auto Game ボードドメインロジック
 *
 * Electron 版の domain/texas_holdem/auto/board.ts を TypeScript で移植
 */

import { foldPlayer, sortPlayers } from "./player";
import type { AutoModeBoard, AutoModePlayer, Card } from "./types";

/**
 * ボード上でプレイヤーを fold する
 */
export function foldPlayerOnBoard(
  board: AutoModeBoard,
  playerId: string,
): AutoModeBoard {
  const updatedPlayers = board.players.map((p) => {
    if (p.id === playerId) {
      return foldPlayer(p);
    }
    return p;
  });
  return { ...board, players: updatedPlayers };
}

/**
 * 新しいボードを作成する
 */
export function createBoard(args: {
  setting: AutoModeBoard["setting"];
  players: AutoModePlayer[];
  communityCards?: Card[];
  burnCards?: Card[];
  handNumber: number;
  winners?: string[] | null;
}): AutoModeBoard {
  return {
    setting: args.setting,
    players: sortPlayers(args.players),
    communityCards: args.communityCards ?? [],
    burnCards: args.burnCards ?? [],
    handNumber: args.handNumber,
    winners: args.winners ?? null,
  };
}

/**
 * ボードにコミュニティカードを追加する
 */
export function addCommunityCard(
  board: AutoModeBoard,
  card: Card,
): AutoModeBoard {
  return {
    ...board,
    communityCards: [...board.communityCards, card],
  };
}

/**
 * ボードにバーンカードを追加する
 */
export function addBurnCard(board: AutoModeBoard, card: Card): AutoModeBoard {
  return {
    ...board,
    burnCards: [...board.burnCards, card],
  };
}

/**
 * プレイヤーのホールカードを更新する
 * 既に 2 枚確定済みの場合は無視する (誤スキャン防御)
 */
export function updatePlayerHand(
  board: AutoModeBoard,
  playerSeat: number,
  card: Card,
): AutoModeBoard {
  const playerIndex = board.players.findIndex((p) => p.seat === playerSeat);
  if (playerIndex === -1) return board;

  const player = board.players[playerIndex];
  const currentHand = player.hand;

  // 同じカードが既にある場合は変更なし
  if (currentHand.some((c) => c.suit === card.suit && c.value === card.value)) {
    return board;
  }

  if (currentHand.length >= 2) {
    return board; // 確定済みの hand は更新しない
  }

  const newHand: Card[] = [...currentHand, card];

  const updatedPlayers = [...board.players];
  updatedPlayers[playerIndex] = { ...player, hand: newHand };

  return { ...board, players: updatedPlayers };
}

/**
 * Auto Mode ボードから次に配るべきカードの位置を決定する。
 *
 * 優先順: プレイヤーホールカード → バーンカード → コミュニティカード
 *
 * バーン判定:
 *   - communityCards.length === 0 && burnCards.length === 0 → バーン (フロップ前)
 *   - communityCards.length === 3 && burnCards.length === 1 → バーン (ターン前)
 *   - communityCards.length === 4 && burnCards.length === 2 → バーン (リバー前)
 */
export type AutoCardPosition =
  | { type: "playerHand"; seat: number }
  | { type: "communityCard"; slot: number }
  | { type: "burnCard" }
  | null; // 全カード配布済み

export function determineAutoNextCardPosition(
  board: AutoModeBoard,
): AutoCardPosition {
  // ホールカードが未配布のプレイヤー (seat 昇順) を探す
  const undealtPlayer = board.players
    .filter((p) => p.hand.length < 2)
    .sort((a, b) => a.seat - b.seat)[0];

  if (undealtPlayer) {
    return { type: "playerHand", seat: undealtPlayer.seat };
  }

  // バーン判定
  const communityCount = board.communityCards.length;
  const burnCount = board.burnCards.length;
  if (
    (communityCount === 0 && burnCount === 0) ||
    (communityCount === 3 && burnCount === 1) ||
    (communityCount === 4 && burnCount === 2)
  ) {
    return { type: "burnCard" };
  }

  // コミュニティカード (最大 5 枚)
  if (communityCount < 5) {
    return { type: "communityCard", slot: communityCount };
  }

  return null;
}

/**
 * プレイヤーの Odds を更新する
 */
export function updatePlayerOdds(
  board: AutoModeBoard,
  oddsMap: Map<string, number>,
): AutoModeBoard {
  const updatedPlayers = board.players.map((p) => {
    const odds = oddsMap.get(p.id);
    return { ...p, odds: odds ?? null };
  });
  return { ...board, players: updatedPlayers };
}
