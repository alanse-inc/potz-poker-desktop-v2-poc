/**
 * Auto Game モードのドメイン型定義
 */

import type { Card } from "../../types";

export type { Card };

/**
 * ポーカーポジション
 */
export type TexasHoldemPosition =
  | "btn"
  | "btn_sb"
  | "sb"
  | "bb"
  | "utg"
  | "utg_plus_1"
  | "utg_plus_2"
  | "utg_plus_3"
  | "mp"
  | "hj"
  | "co";

/**
 * Auto Mode プレイヤーアクション (fold のみ)
 */
export type AutoModeAction = "fold";

/**
 * プレイヤーアイコン (base64 または URL)
 */
export type PlayerIcon = string;

/**
 * Auto Mode プレイヤー
 */
export type AutoModePlayer = {
  id: string;
  name: string;
  icon: PlayerIcon | null;
  seat: number; // 1-9
  position: TexasHoldemPosition | null;
  action: AutoModeAction | null;
  /** ホールカード (0〜2枚) */
  hand: Card[];
  /** 勝率 (0〜1), 未計算時は null */
  odds: number | null;
};

/**
 * Auto Mode ゲーム設定
 */
export type AutoModeGameSetting = {
  name: string;
};

/**
 * Auto Mode ゲームボード (プレイ中)
 */
export type AutoModeBoard = {
  setting: AutoModeGameSetting;
  players: AutoModePlayer[];
  communityCards: Card[];
  burnCards: Card[];
  handNumber: number;
  /** リバー判定済みの勝者 PlayerId 一覧 (null = 未確定) */
  winners: string[] | null;
};

/**
 * Auto Mode 初期ボード (ゲーム開始前)
 */
export type AutoModeInitialBoard = {
  setting: AutoModeGameSetting;
  players: AutoModePlayer[];
  handNumber: number;
};
