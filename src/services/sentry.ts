import * as Sentry from "@sentry/react";

/**
 * トラッキングサービスの初期化
 * Sentry 分析・エラートラッキングサービスをここで初期化する
 *
 * ユーザー情報の設定について：
 * - ユーザー情報は初期化時には設定できません（ログイン前のため）
 * - ユーザー情報は AuthContext で
 *   セッション状態変更時に動的に設定されます
 * - Sentry.setUser({ id: user.sub }) でログイン中のユーザー情報が全エラーに付与されます
 */

/** DSN が設定されているかどうか（Sentry 連携が有効か） */
export const isSentryEnabled = Boolean(import.meta.env.VITE_SENTRY_DSN);

export const initializeSentry = () => {
  // Sentry初期化
  if (isSentryEnabled) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      enabled:
        import.meta.env.PROD ||
        import.meta.env.VITE_SENTRY_ENABLED_DEV === "true",
      sendDefaultPii: false,
      environment: import.meta.env.VITE_BUILD_ENV,
      release: `desktop-app@${import.meta.env.VITE_APP_VERSION}`,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
  }
};

// Sentryのエクスポート（Error Boundaryなどで使用）
export { Sentry };
