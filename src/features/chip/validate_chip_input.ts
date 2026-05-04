/**
 * 入力値を検証し、有効な数値に変換する関数
 * @param input 入力文字列
 * @param maxValue 最大許容値
 * @returns 検証済みの数値
 */
export function validateChipInput(input: string, maxValue: number): number {
  // 先頭のゼロを除去し数値以外をフィルタリング
  const sanitizedValue = input.replace(/^0+/, "").replace(/[^0-9]/g, "");
  const numericValue = sanitizedValue === "" ? "0" : sanitizedValue;

  // 数値変換とバリデーション
  const parsedValue = Number.parseInt(numericValue, 10);
  if (Number.isNaN(parsedValue)) {
    return 0;
  }

  // 値の範囲を制限（0〜MAX_CHIP_VALUE）
  return Math.max(0, Math.min(parsedValue, maxValue));
}
