/**
 * エラートラッカー (Tauri 版 stub)
 *
 * Electron 版では Sentry + toast を使っていたが、Tauri 版では
 * console.error のみのシンプルな実装にとどめる。
 * 将来的に Sentry/crash-reporter を繋ぎ込む際はここを差し替える。
 */

export function trackClientSideError(
  message: string,
  options?: {
    cause?: unknown;
    context?: Record<string, string | number | boolean | null | undefined>;
  },
): void {
  const cause = options?.cause;
  if (cause instanceof Error) {
    console.error(`[trackClientSideError] ${message}`, cause);
  } else if (cause !== undefined) {
    console.error(`[trackClientSideError] ${message}`, cause);
  } else {
    console.error(`[trackClientSideError] ${message}`);
  }
}

export function trackError(result: {
  type?: string;
  message?: string;
  cause?: unknown;
}): void {
  console.error("[trackError]", result);
}
