/**
 * トーストメッセージ定数
 *
 * ユーザーに表示するトーストメッセージを一元管理する
 */

// ============================================
// エラーメッセージ
// ============================================

/**
 * カード配置エラーメッセージ
 */
export const CARD_PLACED_ERROR_MESSAGES = {
  /** 重複カード検出時のメッセージ */
  DUPLICATE_CARD: "重複したカードを読み込みました",
  /** 汎用的なカード配置エラーメッセージ */
  GENERIC: "カードの配置に失敗しました",
} as const;

/**
 * ゲームアクションエラーメッセージ
 */
export const GAME_ACTION_ERROR_MESSAGES = {
  GENERIC: "アクションに失敗しました",
} as const;

/**
 * ゲーム設定エラーメッセージ
 */
export const GAME_SETTING_ERROR_MESSAGES = {
  GENERIC: "ゲーム設定の更新に失敗しました",
} as const;

/**
 * ボードエラーメッセージ
 */
export const BOARD_ERROR_MESSAGES = {
  GENERIC: "ボードの更新に失敗しました",
} as const;

/**
 * 不明なエラーメッセージ
 */
export const UNKNOWN_ERROR_MESSAGES = {
  GENERIC: "不明なエラーが発生しました",
} as const;

/**
 * 重複カードエラーを検出するためのパターン
 * バックエンドから送られてくるエラーメッセージに含まれる文字列
 */
export const DUPLICATE_CARD_ERROR_PATTERN = "Duplicate card detected";

// ============================================
// 成功メッセージ
// ============================================

/**
 * カード操作の成功メッセージ
 */
export const CARD_SUCCESS_MESSAGES = {
  /** カード読み込み成功時のメッセージ */
  CARD_READ: "カードを読み込みました",
} as const;
