/**
 * Auto Game ボード初期化ワークフロー
 */

import {
  assignPositions,
  initializePlayers,
} from "../../domain/auto_game/player";
import type {
  AutoModeBoard,
  AutoModeGameSetting,
  AutoModePlayer,
} from "../../domain/auto_game/types";

export type InitializeBoardResult =
  | { ok: true; board: AutoModeBoard }
  | { ok: false; error: string };

/**
 * ゲームボードを初期化する
 *
 * @param setting ゲーム設定
 * @param players プレイヤー一覧 (ポジション設定済み)
 * @param handNumber ハンド番号
 */
export function initializeBoard(args: {
  setting: AutoModeGameSetting;
  players: Pick<AutoModePlayer, "id" | "name" | "icon" | "seat">[];
  btnPlayerId: string;
  handNumber: number;
}): InitializeBoardResult {
  const { setting, players, btnPlayerId, handNumber } = args;

  if (players.length < 2) {
    return { ok: false, error: "プレイヤーは 2 人以上必要です" };
  }

  const initializedPlayers = initializePlayers(players);
  const playersWithPositions = assignPositions(initializedPlayers, btnPlayerId);

  const board: AutoModeBoard = {
    setting,
    players: playersWithPositions,
    communityCards: [],
    burnCards: [],
    handNumber,
    winners: null,
  };

  return { ok: true, board };
}
