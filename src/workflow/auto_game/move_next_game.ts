/**
 * Auto Game 次ゲームへ移行するワークフロー
 *
 * Electron 版の workflow/texas_holdem/auto/move_next_game.ts を TypeScript で移植
 */

import {
  assignPositions,
  determineNextButtonPlayerId,
  initializePlayers,
} from "../../domain/auto_game/player";
import type {
  AutoModeBoard,
  AutoModeInitialBoard,
} from "../../domain/auto_game/types";

export type MoveNextGameResult =
  | { ok: true; board: AutoModeInitialBoard }
  | { ok: false; error: string };

/**
 * 現在のボードから次のゲームの初期ボードを生成する
 *
 * 1. ハンド番号をインクリメント
 * 2. プレイヤーを初期化 (手札・アクション・ポジション・Odds をリセット)
 * 3. 次の BTN を決定
 * 4. ポジションを割り当て
 */
export function moveNextGame(board: AutoModeBoard): MoveNextGameResult {
  const nextHandNumber = board.handNumber + 1;

  // プレイヤーの初期化
  const initializedPlayers = initializePlayers(
    board.players.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      seat: p.seat,
    })),
  );

  // 次の BTN プレイヤーを決定
  const nextBtnId = determineNextButtonPlayerId(
    board.players,
    initializedPlayers,
  );

  if (!nextBtnId) {
    return { ok: false, error: "No active player found for next BTN" };
  }

  // ポジションを割り当て
  const playersWithPositions = assignPositions(initializedPlayers, nextBtnId);

  const nextBoard: AutoModeInitialBoard = {
    setting: board.setting,
    players: playersWithPositions,
    handNumber: nextHandNumber,
  };

  return { ok: true, board: nextBoard };
}
