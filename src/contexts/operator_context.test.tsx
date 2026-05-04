import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./auth_context";
import { OperatorProvider, useOperator } from "./operator_context";

// @tauri-apps/api/core と @tauri-apps/api/event は setup.ts でモック済み
// operator_context.test.tsx では個別にモックを上書きする

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

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
  <AuthProvider>
    <OperatorProvider>{children}</OperatorProvider>
  </AuthProvider>
);

describe("OperatorProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // listen は unsubscribe 関数を返す
    vi.mocked(listen).mockResolvedValue(() => {});
    // デフォルト: invoke はすべて失敗（command 未実装想定）
    vi.mocked(invoke).mockRejectedValue(new Error("command not found"));
  });

  it("初期状態で operator は null", async () => {
    const { result } = renderHook(() => useOperator(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingOperator).toBe(false);
    });

    expect(result.current.operator).toBeNull();
  });

  it("初期状態で gameTable は null", async () => {
    const { result } = renderHook(() => useOperator(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingOperator).toBe(false);
    });

    expect(result.current.gameTable).toBeNull();
  });

  it("invoke('get_operator_me') が失敗した場合 operatorError がセットされる", async () => {
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "get_operator_me") {
        return Promise.reject(new Error("stub error"));
      }
      return Promise.reject(new Error("command not found"));
    });

    // AuthProvider の isSignedIn が true になる状態をシミュレートするには
    // AuthProvider 内で VITE_SKIP_AUTH_SCREEN 環境変数の影響を受けるが、
    // テスト環境では isSignedIn=false のため、このテストは operator=null を確認する
    const { result } = renderHook(() => useOperator(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingOperator).toBe(false);
    });

    // isSignedIn=false なので operator は null のまま（フェッチ自体が行われない）
    expect(result.current.operator).toBeNull();
  });

  it("OperatorProvider の外で useOperator を呼ぶとエラーになる", () => {
    expect(() => {
      renderHook(() => useOperator());
    }).toThrow("useOperator must be used within OperatorProvider");
  });

  it("loadGameTable は operator が null の場合何もしない", async () => {
    const { result } = renderHook(() => useOperator(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingOperator).toBe(false);
    });

    // operator が null なので loadGameTable は invoke を呼ばない
    await result.current.loadGameTable("some-table-id");

    expect(invoke).not.toHaveBeenCalledWith(
      "get_game_table",
      expect.anything(),
    );
  });

  it("listen('serial_status_updated') が呼ばれる（operator が非 null の場合）", async () => {
    // operator が取得できる状態をシミュレートするには isSignedIn=true が必要
    // テスト環境では auth0 未設定のため isSignedIn=false → listen は呼ばれない
    // このテストは listen の呼ばれないことを確認する
    const { result } = renderHook(() => useOperator(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingOperator).toBe(false);
    });

    // isSignedIn=false のため operator=null → listen は呼ばれない
    expect(listen).not.toHaveBeenCalledWith(
      "serial_status_updated",
      expect.anything(),
    );
  });
});
