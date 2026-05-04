/**
 * Auto Game Fold ワークフロー
 *
 * Electron 版の workflow/texas_holdem/auto/fold.ts を TypeScript で移植
 * ターン管理・履歴保存なし
 */

import { foldPlayerOnBoard } from "../../domain/auto_game/board";
import type { AutoModeBoard } from "../../domain/auto_game/types";

export type FoldResult =
  | { ok: true; board: AutoModeBoard }
  | { ok: false; error: string };

/**
 * 指定プレイヤーを fold 状態にする
 * - 勝率計算は TODO (Electron 版では calculateOdds を呼ぶが、
 *   Tauri 版では Rust コマンドなし → 現時点はスキップ)
 */
export function executeFold(
  board: AutoModeBoard,
  playerId: string,
): FoldResult {
  const player = board.players.find((p) => p.id === playerId);
  if (!player) {
    return { ok: false, error: `Player not found: ${playerId}` };
  }

  const updatedBoard = foldPlayerOnBoard(board, playerId);
  return { ok: true, board: updatedBoard };
}

/**
 * 指定プレイヤーの fold を解除する (action を null に戻す)
 */
export function executeUnfold(
  board: AutoModeBoard,
  playerId: string,
): FoldResult {
  const updatedPlayers = board.players.map((p) => {
    if (p.id === playerId && p.action === "fold") {
      return { ...p, action: null };
    }
    return p;
  });
  return { ok: true, board: { ...board, players: updatedPlayers } };
}
