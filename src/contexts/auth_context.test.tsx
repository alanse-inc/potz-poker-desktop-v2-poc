import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, isCredentialError, useAuth } from "./auth_context";

// auth0-spa-js はテスト環境では動作させない
vi.mock("@auth0/auth0-spa-js", () => ({
  Auth0Client: vi.fn().mockImplementation(() => ({
    loginWithRedirect: vi.fn(),
    loginWithPopup: vi.fn(),
    getTokenSilently: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn(),
    isAuthenticated: vi.fn().mockResolvedValue(false),
  })),
}));

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

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("初期状態では isSignedIn が false", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      // 初期化完了を待つ
    });

    expect(result.current.isSignedIn).toBe(false);
  });

  test("Auth0 未設定時に loginWithPassword を呼ぶと authError がセットされる", async () => {
    // VITE_AUTH0_DOMAIN が未設定の環境（テスト環境）での動作確認
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      try {
        await result.current.loginWithPassword("testuser", "testpass");
      } catch {
        // エラーは再スローされる場合がある
      }
    });

    // Auth0 未設定または TODO 実装中のエラーが authError にセットされる
    expect(result.current.authError).not.toBeNull();
  });

  test("useAuth を AuthProvider 外で呼ぶと例外をスロー", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within AuthProvider",
    );
  });
});
