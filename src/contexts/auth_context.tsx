import type { Auth0Client } from "@auth0/auth0-spa-js";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { identifyUser, resetMixpanel } from "../services/mixpanel";
import { Sentry } from "../services/sentry";

export type Auth0LicenseObject = {
  license_type?: "paid" | "free" | "test";
  status?: "active" | "expired" | "inactive";
  payment_method?: "card" | "bank_transfer";
  stripe_customer_id?: string;
  current_period_end?: number;
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
  loginWithRedirect: () => Promise<void>;
  loginWithPassword: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isAuth0Configured(): boolean {
  return (
    !!import.meta.env.VITE_AUTH0_DOMAIN &&
    !!import.meta.env.VITE_AUTH0_CLIENT_ID
  );
}

export function isCredentialError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes("403") ||
    message.includes("IDまたはパスワードが間違っています") ||
    message.includes("invalid_grant")
  );
}

function trackClientSideError(
  message: string,
  options?: { cause?: unknown; stack?: string; name?: string },
): void {
  console.error("[Auth] Error:", message, options);
}

async function createAuth0Client(): Promise<Auth0Client> {
  const { Auth0Client: Client } = await import("@auth0/auth0-spa-js");
  return new Client({
    domain: import.meta.env.VITE_AUTH0_DOMAIN as string,
    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID as string,
    authorizationParams: {
      audience: import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined,
      redirect_uri:
        (import.meta.env.VITE_AUTH0_REDIRECT_URI as string | undefined) ??
        "com.potz.poker://callback",
    },
    useRefreshTokens: true,
    cacheLocation: "localstorage",
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>({
    isAuthenticated: false,
  });
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const clientRef = useRef<Auth0Client | null>(null);

  const getClient = useCallback(async (): Promise<Auth0Client | null> => {
    if (!isAuth0Configured()) return null;
    if (!clientRef.current) {
      clientRef.current = await createAuth0Client();
    }
    return clientRef.current;
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuth0Configured()) return;
    try {
      const client = await getClient();
      if (!client) return;
      await client.checkSession();
      const isAuthenticated = await client.isAuthenticated();
      if (isAuthenticated) {
        const user = await client.getUser<User>();
        setSession({ isAuthenticated: true, user });
      } else {
        setSession({ isAuthenticated: false });
      }
    } catch {
      setSession({ isAuthenticated: false });
    }
  }, [getClient]);

  const loginWithRedirect = useCallback(async () => {
    if (isLoggingIn) return;
    if (!isAuth0Configured()) {
      setAuthError("Auth0 が設定されていません。環境変数を確認してください。");
      return;
    }
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const client = await getClient();
      if (!client) return;
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await client.loginWithRedirect({
        openUrl: async (url: string) => {
          await openUrl(url);
        },
      });
    } catch (error) {
      trackClientSideError("[Auth] loginWithRedirect error", {
        cause: error,
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
      });
      setAuthError(
        error instanceof Error ? error.message : "ログインに失敗しました",
      );
      throw error;
    } finally {
      setIsLoggingIn(false);
    }
  }, [isLoggingIn, getClient]);

  const loginWithPassword = useCallback(
    async (_username: string, _password: string) => {
      await loginWithRedirect();
    },
    [loginWithRedirect],
  );

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const client = await getClient();
      if (!client) return null;
      return await client.getTokenSilently();
    } catch {
      return null;
    }
  }, [getClient]);

  const logout = useCallback(async () => {
    try {
      const client = await getClient();
      if (client) {
        await client.logout({ openUrl: false });
      }
    } catch {
      // noop
    }
    Sentry.setUser(null);
    resetMixpanel();
    setSession({ isAuthenticated: false });
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }, [getClient]);

  useEffect(() => {
    if (!isAuth0Configured()) return;

    let unlisten: (() => void) | null = null;

    const setupDeepLink = async () => {
      const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
      unlisten = await onOpenUrl(async (urls: string[]) => {
        const callbackUrl = urls.find(
          (u) =>
            u.startsWith("com.potz.poker://callback") ||
            u.includes("code=") ||
            u.includes("error="),
        );
        if (!callbackUrl) return;
        try {
          const client = await getClient();
          if (!client) return;
          await client.handleRedirectCallback(callbackUrl);
          const user = await client.getUser<User>();
          if (user?.sub) {
            setSession({ isAuthenticated: true, user });
            Sentry.setUser({ id: user.sub });
            identifyUser(user.sub);
          }
        } catch (error) {
          trackClientSideError("[Auth] handleRedirectCallback error", {
            cause: error,
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
          });
          setAuthError(
            error instanceof Error
              ? error.message
              : "コールバック処理に失敗しました",
          );
          setIsLoggingIn(false);
        }
      });
    };

    void setupDeepLink();

    return () => {
      if (unlisten) unlisten();
    };
  }, [getClient]);

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
          const devUser: User = {
            sub: "dev-user-local",
            name: "Development User",
            email: "dev@example.local",
            "https://potzpoker.com/role": "admin",
            "https://potzpoker.com/subscription_status": "active",
            "https://potzpoker.com/license_type": "paid",
          };
          setSession({ isAuthenticated: true, user: devUser });
        } else {
          await refresh();
        }
      } finally {
        setIsInitializing(false);
      }
    };
    void checkSession();
  }, [refresh]);

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
        loginWithRedirect,
        loginWithPassword,
        logout,
        refresh,
        getAccessToken,
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
