/**
 * プレイヤー名のバリデーションを行う
 *
 * - 英数字以外を除去
 * - 最大文字数（8文字）を超える場合は切り捨て
 *
 * @param name プレイヤー名
 * @param maxLength 最大文字数
 * @returns バリデーション済みのプレイヤー名
 */
export function validatePlayerName(name: string, maxLength: number): string {
  // 英数字以外を除去
  const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, "");

  // 最大文字数（8文字）を超える場合は切り捨て
  if (sanitizedName.length > maxLength) {
    return sanitizedName.slice(0, maxLength);
  }

  return sanitizedName;
}
