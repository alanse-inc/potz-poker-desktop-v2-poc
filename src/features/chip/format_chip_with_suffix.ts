/**
 * Chipにサフィックスを付与する
 *
 * - 1,000 未満の場合はそのままの数値
 * - 1,000 以上 1,000,000 未満の場合はKを付与（例: 1500 -> 1.50K, 1999 -> 1.99K, 2000 -> 2K）
 * - 1,000,000 以上の場合はMを付与（例: 4999999 -> 4.99M, 2000000 -> 2M）
 *
 * 負の数の場合も同じルールを適用し、先頭にマイナス記号を付与します。
 *
 * @param chip 数値
 * @returns サフィックス付きの数値
 */
export const formatChipWithSuffix = (chip: number): string => {
  // 符号を保持して変換
  const sign = chip < 0 ? "-" : "";
  const absValue = Math.abs(chip);

  if (absValue < 1000) return `${sign}${absValue}`;

  if (absValue < 1000000) {
    // 整数演算で浮動小数点誤差を回避しつつ小数点以下第2位まで切り捨て
    // 例: 4100 → Math.floor(4100 / 10) / 100 = 410 / 100 = 4.1
    const truncated = Math.floor(absValue / 10) / 100;
    // 2桁表示した後、不要な末尾の ".00" や ".0" を除去
    const formatted = truncated.toFixed(2).replace(/\.?0+$/, "");
    return `${sign}${formatted}K`;
  }

  // 整数演算で浮動小数点誤差を回避しつつ小数点以下第2位まで切り捨て
  // 例: 4100000 → Math.floor(4100000 / 10000) / 100 = 410 / 100 = 4.1
  const truncated = Math.floor(absValue / 10000) / 100;
  const formatted = truncated.toFixed(2).replace(/\.?0+$/, "");
  return `${sign}${formatted}M`;
};
