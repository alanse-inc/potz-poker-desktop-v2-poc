/**
 * Auto Game Fold ワークフロー
 *
 * Electron 版の workflow/texas_holdem/auto/fold.ts を TypeScript で移植
 * ターン管理・履歴保存なし
 */

import { err, ok, type Result } from "neverthrow";
import { foldPlayerOnBoard } from "../../domain/auto_game/board";
import type { AutoModeBoard } from "../../domain/auto_game/types";

export type FoldError = { kind: "player_not_found"; playerId: string };

/**
 * 指定プレイヤーを fold 状態にする
 * - 勝率計算は TODO (Electron 版では calculateOdds を呼ぶが、
 *   Tauri 版では Rust コマンドなし → 現時点はスキップ)
 */
export function executeFold(
  board: AutoModeBoard,
  playerId: string,
): Result<AutoModeBoard, FoldError> {
  const player = board.players.find((p) => p.id === playerId);
  if (!player) {
    return err({ kind: "player_not_found", playerId });
  }

  const updatedBoard = foldPlayerOnBoard(board, playerId);
  return ok(updatedBoard);
}

/**
 * 指定プレイヤーの fold を解除する (action を null に戻す)
 */
export function executeUnfold(
  board: AutoModeBoard,
  playerId: string,
): Result<AutoModeBoard, FoldError> {
  const updatedPlayers = board.players.map((p) => {
    if (p.id === playerId && p.action === "fold") {
      return { ...p, action: null };
    }
    return p;
  });
  return ok({ ...board, players: updatedPlayers });
}
