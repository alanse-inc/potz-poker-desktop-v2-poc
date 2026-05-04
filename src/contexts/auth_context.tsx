import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Auth0 ライセンスオブジェクトの型
 * Electron 版の Auth0LicenseObject と同一構造
 */
export type Auth0LicenseObject = {
  license_type?: "paid" | "free" | "test";
  status?: "active" | "expired" | "inactive";
  payment_method?: "card" | "bank_transfer";
  stripe_customer_id?: string;
  current_period_end?: number; // Unix timestamp (秒)
};

export type User = {
  sub: string;
  name?: string;
  nickname?: string;
  email?: string;
  "https://potzpoker.com/role"?: string;
  "https://potzpoker.com/license"?: Auth0LicenseObject;
  "https://potzpoker.com/subscription_status"?: string;
  "https://potzpoker.com/license_type"?: string;
  "https://potzpoker.com/current_period_end"?: number;
  "https://potzpoker.com/payment_method"?: string;
  "https://potzpoker.com/subscription_plan"?: string;
  [key: string]: unknown;
};

type AuthSession = {
  isAuthenticated: boolean;
  user?: User;
};

type AuthContextValue = {
  isSignedIn: boolean;
  user: User | null;
  isInitializing: boolean;
  isLoggingIn: boolean;
  authError: string | null;
  loginWithPassword: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth0 の設定が環境変数として提供されているかを確認する。
 * VITE_AUTH0_DOMAIN と VITE_AUTH0_CLIENT_ID が空でない場合のみ true。
 */
function isAuth0Configured(): boolean {
  return (
    !!import.meta.env.VITE_AUTH0_DOMAIN &&
    !!import.meta.env.VITE_AUTH0_CLIENT_ID
  );
}

/**
 * ユーザーの認証情報誤り（パスワードミス等）によるエラーかどうかを判定する。
 * 認証情報誤りは想定内の UX イベントのため error tracker に送信しない。
 */
export function isCredentialError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes("403") ||
    message.includes("IDまたはパスワードが間違っています") ||
    message.includes("invalid_grant")
  );
}

/**
 * エラーをコンソールに出力するフォールバック関数。
 * Sentry 等の外部サービスが未設定の環境でも動作する。
 */
function trackClientSideError(
  message: string,
  options?: { cause?: unknown; stack?: string; name?: string },
): void {
  console.error("[Auth] Error:", message, options);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>({
    isAuthenticated: false,
  });
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // TODO(auth0): Tauri 環境でのセッションリフレッシュ実装
    // 戦略: PKCE + redirect_uri = "tauri://localhost" (Tauri 2 仕様) を使用し、
    //        取得したトークンは @tauri-apps/plugin-store でセキュアに保存する。
    //        実装時は auth0-spa-js の getTokenSilently() を呼ぶ。
    if (!isAuth0Configured()) {
      return;
    }
    console.log("[Auth] refresh() called - TODO: implement with auth0-spa-js");
  }, []);

  const loginWithPassword = useCallback(
    async (username: string, _password: string) => {
      if (isLoggingIn) return;

      // Auth0 未設定の場合は dev フォールバック
      if (!isAuth0Configured()) {
        console.warn(
          "[Auth] Auth0 not configured. Set VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID.",
        );
        setAuthError(
          "Auth0 が設定されていません。環境変数を確認してください。",
        );
        return;
      }

      setIsLoggingIn(true);
      setAuthError(null);
      try {
        // TODO(auth0): redirect strategy
        // Tauri 環境では Auth0 Universal Login の redirect は WebView 制約があるため、
        // PKCE フローを使用する:
        //   1. auth0-spa-js の loginWithRedirect() を redirect_uri = "tauri://localhost" で呼ぶ
        //   2. または loginWithPopup() をシステムブラウザで開く
        //      (@tauri-apps/plugin-shell の open() で外部ブラウザを使う方法)
        // 現時点では Resource Owner Password Grant (ROPG) に対応する形を残す。
        // Auth0 の ROPG は deprecated のため、実運用では PKCE + deeplink を推奨。
        const { Auth0Client } = await import("@auth0/auth0-spa-js");
        const client = new Auth0Client({
          domain: import.meta.env.VITE_AUTH0_DOMAIN as string,
          clientId: import.meta.env.VITE_AUTH0_CLIENT_ID as string,
          authorizationParams: {
            audience: import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined,
            redirect_uri: "tauri://localhost",
          },
          useRefreshTokens: true,
          cacheLocation: "localstorage",
        });

        // PKCE フローのスタブ（実装 TODO）
        console.log("[Auth] Auth0Client created, username:", username);
        // await client.loginWithRedirect() or loginWithPopup()
        // ここでは引数を受け取るが実際の ROPG 呼び出しは Auth0 側の設定が必要
        void client;
        throw new Error(
          "Auth0 login not yet implemented. TODO(auth0): redirect strategy",
        );
      } catch (error) {
        if (!isCredentialError(error)) {
          trackClientSideError("[Auth] login error", {
            cause: error,
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
          });
        }

        let errorMessage = "ログインに失敗しました";
        if (error instanceof Error) {
          const message = error.message;
          if (
            message.includes("403") ||
            message.includes("IDまたはパスワードが間違っています")
          ) {
            errorMessage = "IDまたはパスワードが間違っています";
          } else if (message.includes("invalid_grant")) {
            errorMessage = "IDまたはパスワードが間違っています";
          } else {
            errorMessage = message;
          }
        }

        setAuthError(errorMessage);
        throw error;
      } finally {
        setIsLoggingIn(false);
      }
    },
    [isLoggingIn],
  );

  const logout = useCallback(async () => {
    // TODO(auth0): Auth0 のログアウトエンドポイントを呼ぶ
    setSession({ isAuthenticated: false });
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }, []);

  // 初回マウント時のセッションチェック
  useEffect(() => {
    const checkSession = async () => {
      setIsInitializing(true);
      try {
        if (
          import.meta.env.DEV &&
          import.meta.env.VITE_SKIP_AUTH_SCREEN === "true"
        ) {
          console.warn(
            "[Auth] Skipping authentication - VITE_SKIP_AUTH_SCREEN is enabled (DEV mode only)",
          );
          setSession({
            isAuthenticated: true,
            user: {
              sub: "dev-user-local",
              name: "Development User",
              email: "dev@example.local",
              "https://potzpoker.com/role": "admin",
              "https://potzpoker.com/subscription_status": "active",
              "https://potzpoker.com/license_type": "paid",
            } as User,
          });
        } else {
          await refresh();
        }
      } finally {
        setIsInitializing(false);
      }
    };
    void checkSession();
  }, [refresh]);

  // 定期トークンリフレッシュ（30分ごと）
  useEffect(() => {
    if (!session?.isAuthenticated) return;

    const intervalId = setInterval(
      async () => {
        console.log("[Auth] Periodic token refresh...");
        await refresh();
      },
      30 * 60 * 1000,
    );

    return () => clearInterval(intervalId);
  }, [session?.isAuthenticated, refresh]);

  return (
    <AuthContext.Provider
      value={{
        isSignedIn: !!session?.isAuthenticated,
        user: (session?.user as User) ?? null,
        isInitializing,
        isLoggingIn,
        authError,
        loginWithPassword,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
