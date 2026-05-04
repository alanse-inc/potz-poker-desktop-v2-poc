/**
 * Auto Game プレイヤードメインロジック
 *
 * Electron 版の domain/texas_holdem/auto/player.ts を TypeScript で移植
 * neverthrow を使わず Result パターンを簡略化
 */

import type { AutoModePlayer, TexasHoldemPosition } from "./types";

/**
 * BTN から順にポジションを割り当てる配列 (3人以上用)
 * インデックス 0 = BTN, 1 = SB, 2 = BB, ...
 */
const POSITION_ORDER: TexasHoldemPosition[] = [
  "btn",
  "sb",
  "bb",
  "utg",
  "utg_plus_1",
  "utg_plus_2",
  "utg_plus_3",
  "mp",
  "hj",
  "co",
];

/**
 * プレイヤーをシート順にソートする
 */
export function sortPlayers(players: AutoModePlayer[]): AutoModePlayer[] {
  return [...players].sort((a, b) => a.seat - b.seat);
}

/**
 * プレイヤーを fold 状態にする
 */
export function foldPlayer(player: AutoModePlayer): AutoModePlayer {
  return { ...player, action: "fold" };
}

/**
 * fold していないプレイヤーかどうか
 */
export function isActive(player: AutoModePlayer): boolean {
  return player.action !== "fold";
}

/**
 * プレイヤーを初期化する (手札・アクション・ポジション・Odds をリセット)
 */
export function initializePlayer(
  p: Pick<AutoModePlayer, "id" | "name" | "icon" | "seat">,
): AutoModePlayer {
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    seat: p.seat,
    position: null,
    action: null,
    hand: [],
    odds: null,
  };
}

/**
 * プレイヤー一覧を初期化する
 */
export function initializePlayers(
  inputs: Pick<AutoModePlayer, "id" | "name" | "icon" | "seat">[],
): AutoModePlayer[] {
  return inputs.map(initializePlayer);
}

/**
 * 前のゲームの BTN の次のプレイヤーを次の BTN として返す
 */
export function determineNextButtonPlayerId(
  previousPlayers: AutoModePlayer[],
  currentPlayers: AutoModePlayer[],
): string | null {
  const sorted = sortPlayers(currentPlayers);
  if (sorted.length === 0) return null;

  const previousBtn = previousPlayers.find(
    (p) => p.position === "btn" || p.position === "btn_sb",
  );

  if (!previousBtn) {
    return sorted[0].id;
  }

  const prevBtnIndex = sorted.findIndex((p) => p.id === previousBtn.id);
  if (prevBtnIndex === -1) {
    // 前のBTNが現在のリストにいない場合は先頭
    return sorted[0].id;
  }

  // 次のプレイヤーへ (循環)
  const nextIndex = (prevBtnIndex + 1) % sorted.length;
  return sorted[nextIndex].id;
}

/**
 * プレイヤーにポジションを割り当てる
 * - 2人: btn_sb + bb
 * - 3人以上: btn + sb + bb + ...
 */
export function assignPositions(
  players: AutoModePlayer[],
  btnPlayerId: string,
): AutoModePlayer[] {
  const sorted = sortPlayers(players);
  const n = sorted.length;
  if (n < 2) return sorted;

  const btnIndex = sorted.findIndex((p) => p.id === btnPlayerId);
  if (btnIndex === -1) return sorted;

  // ヘッズアップ
  if (n === 2) {
    return sorted.map((p, i) => {
      const offset = (i - btnIndex + n) % n;
      const pos: TexasHoldemPosition = offset === 0 ? "btn_sb" : "bb";
      return { ...p, position: pos };
    });
  }

  // 3人以上: BTN から順にポジションを割り当て
  return sorted.map((p, i) => {
    const offset = (i - btnIndex + n) % n;
    const pos: TexasHoldemPosition | undefined = POSITION_ORDER[offset];
    return { ...p, position: pos ?? null };
  });
}

/**
 * プレイヤーIDでプレイヤーを検索する
 */
export function findPlayerById(
  players: AutoModePlayer[],
  id: string,
): AutoModePlayer | undefined {
  return players.find((p) => p.id === id);
}

/**
 * ポジション表示文字列を返す
 */
export function displayPosition(pos: TexasHoldemPosition | null): string {
  if (pos === null) return "";
  const map: Record<TexasHoldemPosition, string> = {
    btn: "BTN",
    btn_sb: "BTN/SB",
    sb: "SB",
    bb: "BB",
    utg: "UTG",
    utg_plus_1: "+1",
    utg_plus_2: "+2",
    utg_plus_3: "+3",
    mp: "MP",
    hj: "HJ",
    co: "CO",
  };
  return map[pos] ?? "";
}
