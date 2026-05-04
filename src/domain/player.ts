/**
 * プレイヤードメインモジュール (Tauri 版)
 *
 * QR チェックイン由来のプレイヤー ID 判定など、プレイヤー共通のビジネスルールを提供する。
 */

/**
 * 文字列が QR チェックイン由来のプレイヤー ID（16 桁小文字 hex）か判定する type predicate。
 *
 * 注意: 予約済みゲストプレイヤー ID (`0000000000000000`〜`0000000000000009`) も
 * 形式上は 16 桁 hex に一致する。checkout API 呼び出し対象外とする場合は
 * `isReservedGuestPlayerId` と組み合わせて除外すること。
 */
const CHECKED_IN_PLAYER_ID_REGEX = /^[0-9a-f]{16}$/;

export function isCheckedInPlayerId(id: string): boolean {
  return CHECKED_IN_PLAYER_ID_REGEX.test(id);
}
