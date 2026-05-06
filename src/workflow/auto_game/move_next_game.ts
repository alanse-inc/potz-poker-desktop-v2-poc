/**
 * Auto Game 次ゲームへ移行するワークフロー
 *
 * Electron 版の workflow/texas_holdem/auto/move_next_game.ts を TypeScript で移植
 */

import { err, ok, type Result } from "neverthrow";
import {
  assignPositions,
  determineNextButtonPlayerId,
  initializePlayers,
} from "../../domain/auto_game/player";
import type {
  AutoModeBoard,
  AutoModeInitialBoard,
} from "../../domain/auto_game/types";

export type MoveNextGameError = { kind: "no_btn_candidate" };

/**
 * 現在のボードから次のゲームの初期ボードを生成する
 *
 * 1. ハンド番号をインクリメント
 * 2. プレイヤーを初期化 (手札・アクション・ポジション・Odds をリセット)
 * 3. 次の BTN を決定
 * 4. ポジションを割り当て
 */
export function moveNextGame(
  board: AutoModeBoard,
): Result<AutoModeInitialBoard, MoveNextGameError> {
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
    return err({ kind: "no_btn_candidate" });
  }

  // ポジションを割り当て
  const playersWithPositions = assignPositions(initializedPlayers, nextBtnId);

  const nextBoard: AutoModeInitialBoard = {
    setting: board.setting,
    players: playersWithPositions,
    handNumber: nextHandNumber,
  };

  return ok(nextBoard);
}
