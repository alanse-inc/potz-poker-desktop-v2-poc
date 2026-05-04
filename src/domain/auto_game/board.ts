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
 * 既に 2 枚持っている場合は最初のカードを置換
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

  let newHand: Card[];
  if (currentHand.length >= 2) {
    // 2 枚以上持っている場合は最初のカードを置換
    newHand = [currentHand[1], card];
  } else {
    newHand = [...currentHand, card];
  }

  const updatedPlayers = [...board.players];
  updatedPlayers[playerIndex] = { ...player, hand: newHand };

  return { ...board, players: updatedPlayers };
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
