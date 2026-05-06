import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, isCredentialError, useAuth } from "./auth_context";

const mockAuth0Client = {
  loginWithRedirect: vi.fn(),
  handleRedirectCallback: vi.fn(),
  getTokenSilently: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  getUser: vi.fn(),
  isAuthenticated: vi.fn().mockResolvedValue(false),
  checkSession: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@auth0/auth0-spa-js", () => ({
  Auth0Client: function Auth0ClientMock() {
    return mockAuth0Client;
  },
}));

const mockOnOpenUrl = vi.fn().mockResolvedValue(() => {});

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  onOpenUrl: mockOnOpenUrl,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/sentry", () => ({
  Sentry: {
    setUser: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
  },
}));

vi.mock("../services/analytics", () => ({
  identifyUser: vi.fn(),
  resetMixpanel: vi.fn(),
}));

function resetClientMocks() {
  mockAuth0Client.loginWithRedirect.mockReset();
  mockAuth0Client.handleRedirectCallback.mockReset();
  mockAuth0Client.getTokenSilently.mockReset();
  mockAuth0Client.logout.mockResolvedValue(undefined);
  mockAuth0Client.getUser.mockResolvedValue(undefined);
  mockAuth0Client.isAuthenticated.mockResolvedValue(false);
  mockAuth0Client.checkSession.mockResolvedValue(undefined);
  mockOnOpenUrl.mockResolvedValue(() => {});
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe("isCredentialError()", () => {
  test("Error でない値は false を返す", () => {
    expect(isCredentialError("string error")).toBe(false);
    expect(isCredentialError(null)).toBe(false);
    expect(isCredentialError(undefined)).toBe(false);
    expect(isCredentialError(403)).toBe(false);
  });

  test("403 を含むメッセージは true を返す", () => {
    expect(isCredentialError(new Error("HTTP 403 Forbidden"))).toBe(true);
    expect(isCredentialError(new Error("status: 403"))).toBe(true);
  });

  test("「IDまたはパスワードが間違っています」を含むメッセージは true を返す", () => {
    expect(
      isCredentialError(new Error("IDまたはパスワードが間違っています")),
    ).toBe(true);
  });

  test("invalid_grant を含むメッセージは true を返す", () => {
    expect(isCredentialError(new Error("invalid_grant"))).toBe(true);
    expect(
      isCredentialError(new Error("error: invalid_grant (Wrong credentials)")),
    ).toBe(true);
  });

  test("それ以外のメッセージは false を返す", () => {
    expect(isCredentialError(new Error("Network error"))).toBe(false);
    expect(isCredentialError(new Error("Login failed: 500"))).toBe(false);
    expect(isCredentialError(new Error("Userinfo failed: 401"))).toBe(false);
  });
});

describe("AuthProvider 初期状態 (Auth0 未設定)", () => {
  beforeEach(() => {
    resetClientMocks();
  });

  test("初期状態では isSignedIn が false", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });

  test("初期状態では isLoggingIn が false", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(result.current.isLoggingIn).toBe(false);
  });

  test("初期状態では authError が null", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(result.current.authError).toBeNull();
  });

  test("Auth0 未設定時に loginWithRedirect を呼ぶと authError がセットされる", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.loginWithRedirect();
    });

    expect(result.current.authError).not.toBeNull();
  });
});

describe("AuthProvider (Auth0 設定済み)", () => {
  beforeEach(() => {
    resetClientMocks();
    vi.stubEnv("VITE_AUTH0_DOMAIN", "test.auth0.com");
    vi.stubEnv("VITE_AUTH0_CLIENT_ID", "test-client-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("初期化時に onOpenUrl が登録される", async () => {
    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(mockOnOpenUrl).toHaveBeenCalled();
    });
  });

  test("Auth0 設定済みで refresh が呼ばれると checkSession が実行される", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(mockAuth0Client.checkSession).toHaveBeenCalled();
  });
});

describe("deep-link コールバック処理", () => {
  beforeEach(() => {
    resetClientMocks();
    vi.stubEnv("VITE_AUTH0_DOMAIN", "test.auth0.com");
    vi.stubEnv("VITE_AUTH0_CLIENT_ID", "test-client-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("コールバック URL 受信時に handleRedirectCallback が呼ばれてセッションが更新される", async () => {
    const mockUser = {
      sub: "auth0|test123",
      name: "Test User",
      email: "test@example.com",
    };
    mockAuth0Client.getUser.mockResolvedValue(mockUser);
    mockAuth0Client.handleRedirectCallback.mockResolvedValue({});

    let capturedHandler: ((urls: string[]) => void) | null = null;
    mockOnOpenUrl.mockImplementation(
      async (handler: (urls: string[]) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(capturedHandler).not.toBeNull();
    });

    await act(async () => {
      if (capturedHandler) {
        await capturedHandler([
          "com.potz.poker://callback?code=testcode&state=teststate",
        ]);
      }
    });

    await waitFor(() => {
      expect(result.current.isSignedIn).toBe(true);
    });

    expect(mockAuth0Client.handleRedirectCallback).toHaveBeenCalledWith(
      "com.potz.poker://callback?code=testcode&state=teststate",
    );
  });

  test("コールバック処理成功時に Sentry.setUser が呼ばれる", async () => {
    const { Sentry } = await import("../services/sentry");
    const mockUser = { sub: "auth0|test123", name: "Test User" };
    mockAuth0Client.getUser.mockResolvedValue(mockUser);
    mockAuth0Client.handleRedirectCallback.mockResolvedValue({});

    let capturedHandler: ((urls: string[]) => void) | null = null;
    mockOnOpenUrl.mockImplementation(
      async (handler: (urls: string[]) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(capturedHandler).not.toBeNull();
    });

    await act(async () => {
      if (capturedHandler) {
        await capturedHandler([
          "com.potz.poker://callback?code=testcode&state=teststate",
        ]);
      }
    });

    await waitFor(() => {
      expect(vi.mocked(Sentry.setUser)).toHaveBeenCalledWith({
        id: "auth0|test123",
      });
    });
  });

  test("コールバック処理成功時に identifyUser が呼ばれる", async () => {
    const { identifyUser } = await import("../services/analytics");
    const mockUser = { sub: "auth0|test123", name: "Test User" };
    mockAuth0Client.getUser.mockResolvedValue(mockUser);
    mockAuth0Client.handleRedirectCallback.mockResolvedValue({});

    let capturedHandler: ((urls: string[]) => void) | null = null;
    mockOnOpenUrl.mockImplementation(
      async (handler: (urls: string[]) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(capturedHandler).not.toBeNull();
    });

    await act(async () => {
      if (capturedHandler) {
        await capturedHandler([
          "com.potz.poker://callback?code=testcode&state=teststate",
        ]);
      }
    });

    await waitFor(() => {
      expect(vi.mocked(identifyUser)).toHaveBeenCalledWith("auth0|test123");
    });
  });

  test("関係ない URL はコールバック処理をスキップする", async () => {
    let capturedHandler: ((urls: string[]) => void) | null = null;
    mockOnOpenUrl.mockImplementation(
      async (handler: (urls: string[]) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(capturedHandler).not.toBeNull();
    });

    await act(async () => {
      if (capturedHandler) {
        await capturedHandler(["https://example.com/unrelated"]);
      }
    });

    expect(mockAuth0Client.handleRedirectCallback).not.toHaveBeenCalled();
  });

  test("com.potz.poker://callback で始まらない URL は code= を含んでもコールバック処理されない", async () => {
    mockAuth0Client.handleRedirectCallback.mockResolvedValue({});

    let capturedHandler: ((urls: string[]) => void) | null = null;
    mockOnOpenUrl.mockImplementation(
      async (handler: (urls: string[]) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(capturedHandler).not.toBeNull();
    });

    await act(async () => {
      if (capturedHandler) {
        await capturedHandler(["myapp://auth?code=abc123&state=xyz"]);
      }
    });

    expect(mockAuth0Client.handleRedirectCallback).not.toHaveBeenCalled();
  });
});

describe("loginWithRedirect()", () => {
  beforeEach(() => {
    resetClientMocks();
    vi.stubEnv("VITE_AUTH0_DOMAIN", "test.auth0.com");
    vi.stubEnv("VITE_AUTH0_CLIENT_ID", "test-client-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("loginWithRedirect が Auth0Client.loginWithRedirect を呼ぶ", async () => {
    mockAuth0Client.loginWithRedirect.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.loginWithRedirect();
    });

    expect(mockAuth0Client.loginWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ openUrl: expect.any(Function) }),
    );
  });

  test("loginWithRedirect エラー時に authError がセットされる", async () => {
    mockAuth0Client.loginWithRedirect.mockRejectedValue(
      new Error("Login failed"),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.loginWithRedirect();
      } catch {
        // 再スロー
      }
    });

    expect(result.current.authError).toBe("Login failed");
  });

  test("loginWithPassword は loginWithRedirect に委譲する", async () => {
    mockAuth0Client.loginWithRedirect.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.loginWithPassword("user", "pass");
    });

    expect(mockAuth0Client.loginWithRedirect).toHaveBeenCalled();
  });
});

describe("logout()", () => {
  beforeEach(() => {
    resetClientMocks();
    vi.stubEnv("VITE_AUTH0_DOMAIN", "test.auth0.com");
    vi.stubEnv("VITE_AUTH0_CLIENT_ID", "test-client-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("logout 後に isSignedIn が false になる", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isSignedIn).toBe(false);
  });

  test("logout 時に Sentry.setUser(null) が呼ばれる", async () => {
    const { Sentry } = await import("../services/sentry");
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(vi.mocked(Sentry.setUser)).toHaveBeenCalledWith(null);
  });

  test("logout 時に resetMixpanel が呼ばれる", async () => {
    const { resetMixpanel } = await import("../services/analytics");
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(vi.mocked(resetMixpanel)).toHaveBeenCalled();
  });

  test("Auth0Client.logout が { openUrl: false } で呼ばれる", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(mockAuth0Client.logout).toHaveBeenCalledWith({ openUrl: false });
  });

  test("logout 時に auto_mode_board が localStorage から削除される", async () => {
    // 前ユーザーのゲーム状態を localStorage にセットしておく
    localStorage.setItem("auto_mode_board", JSON.stringify({ players: [] }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(localStorage.getItem("auto_mode_board")).toBeNull();
  });

  test("logout 時に auto_mode_board が存在しなくてもエラーにならない", async () => {
    // localStorage に auto_mode_board がない状態でも logout が正常に動作する
    localStorage.removeItem("auto_mode_board");

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.logout();
      }),
    ).resolves.not.toThrow();

    expect(result.current.isSignedIn).toBe(false);
  });
});

describe("useAuth を AuthProvider 外で使う", () => {
  test("例外をスロー", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within AuthProvider",
    );
  });
});

describe("logout() – タイマー管理 (Bug 5)", () => {
  beforeEach(() => {
    resetClientMocks();
    vi.stubEnv("VITE_AUTH0_DOMAIN", "test.auth0.com");
    vi.stubEnv("VITE_AUTH0_CLIENT_ID", "test-client-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  test("logout を複数回呼んでも window.location.reload が 1 回しか呼ばれない", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    vi.useFakeTimers();

    await act(async () => {
      await result.current.logout();
      await result.current.logout();
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  test("unmount 後は reload タイマー発火しても window.location.reload が呼ばれない", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
    });

    const { result, unmount } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    vi.useFakeTimers();

    await act(async () => {
      await result.current.logout();
    });

    unmount();

    act(() => {
      vi.runAllTimers();
    });

    expect(reloadMock).not.toHaveBeenCalled();
  });
});
