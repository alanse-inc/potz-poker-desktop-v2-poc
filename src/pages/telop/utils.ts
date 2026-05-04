import { formatChipWithSuffix } from "../../features/chip/format_chip_with_suffix";
import type { Player, TexasHoldemBoard } from "../../types";

/**
 * プレイヤーのポジション表示文字列を返す
 * Tauri 版のボードは position が index で表現されているため、
 * dealer/sb/bb position との比較でポジションを判定する
 */
export function getPositionLabel(
  player: Player,
  board: TexasHoldemBoard,
): string {
  const total = board.players.length;
  if (total === 2) {
    // ヘッズアップ: BTN/SB と BB
    if (player.position === board.dealerPosition) return "BTN/SB";
    if (player.position === board.bbPosition) return "BB";
  } else {
    if (player.position === board.dealerPosition) return "BTN";
    if (player.position === board.sbPosition) return "SB";
    if (player.position === board.bbPosition) return "BB";
  }
  return "";
}

/**
 * プレイヤーのアクション表示文字列を返す
 */
export function getActionDisplay(
  player: Player,
  board: TexasHoldemBoard,
): string | null {
  const { betInRound, hasFolded } = player;

  if (hasFolded) return "FOLD";

  // アクション表示の簡易版
  // Tauri 版は action フィールドを持たないため、状態から推定
  // currentTurn が当該プレイヤーなら "Acting..." も考えられるが省略
  if (betInRound > 0) {
    const position = getPositionLabel(player, board);
    if (position === "SB" && board.phase === "pre_flop") {
      return `SB ${formatChipWithSuffix(betInRound)}`;
    }
    if (position === "BB" && board.phase === "pre_flop") {
      return `BB ${formatChipWithSuffix(betInRound)}`;
    }
    return `BET ${formatChipWithSuffix(betInRound)}`;
  }

  return null;
}

/**
 * 表示するプレイヤーをフィルタリング（fold かつ hand なしを除外）
 */
export function getActiveTelopPlayers(board: TexasHoldemBoard): Player[] {
  return board.players.filter((p) => p.hand !== null && !p.hasFolded);
}

/**
 * プレイヤーを左右に分割する（最大 5 人ずつ）
 */
export function splitPlayersLeftRight(players: Player[]): {
  left: Player[];
  right: Player[];
} {
  const maxLeft = 5;
  if (players.length <= maxLeft) {
    return { left: players, right: [] };
  }
  const half = Math.ceil(players.length / 2);
  return {
    left: players.slice(0, Math.min(half, maxLeft)),
    right: players.slice(Math.min(half, maxLeft)),
  };
}

/**
 * ポット合計を計算する
 */
export function getTotalPot(board: TexasHoldemBoard): number {
  return board.pots.reduce((sum, p) => sum + p.amount, 0);
}
