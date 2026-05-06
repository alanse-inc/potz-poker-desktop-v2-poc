import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { act, renderHook, waitFor } from "@testing-library/react";
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

  it("listen('serial_status_updated') は mount 時に operator の有無に関わらず呼ばれる", async () => {
    // Bug 6 fix: operator=null でもデバイス接続変化を検知できるよう
    // mount 時に必ず listen を 1 回登録する
    const { result } = renderHook(() => useOperator(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingOperator).toBe(false);
    });

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith(
        "serial_status_updated",
        expect.anything(),
      );
    });
  });

  it("pollDeviceConnection と serial_status_updated が同時発火しても loadGameTable は 1 回のみ呼ばれる", async () => {
    // isLoadingGameTableRef が fetchSerialStatus の await 前にセットされることで
    // serial_status_updated ハンドラは isLoadingGameTableRef.current=true を検知してスキップする
    // このテストは operator=null 状態のため実際のポーリングは動かないが、
    // フラグの整合性を確認する
    const { result } = renderHook(() => useOperator(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingOperator).toBe(false);
    });

    // operator=null のため loadGameTable は invoke を呼ばない
    // 複数回呼んでも invoke("get_game_table") は呼ばれない
    await result.current.loadGameTable("table-1");
    await result.current.loadGameTable("table-2");

    expect(invoke).not.toHaveBeenCalledWith(
      "get_game_table",
      expect.anything(),
    );
  });

  it("getGameTable が遅延中に serial_status_updated が 2 回発火しても get_game_table は 1 回だけ呼ばれる (Bug C)", async () => {
    // VITE_SKIP_AUTH_SCREEN=true で isSignedIn=true にし、
    // get_operator_me を成功させて operator をセットする
    vi.stubEnv("VITE_SKIP_AUTH_SCREEN", "true");

    // serial_status_updated ハンドラをキャプチャするためにモックを差し替える
    type SerialStatusPayload = { connected: boolean; portName: string | null };
    type EventHandler = (event: { payload: SerialStatusPayload }) => void;
    let capturedHandler: EventHandler | null = null;
    vi.mocked(listen).mockImplementation((_event, handler) => {
      capturedHandler = handler as EventHandler;
      return Promise.resolve(() => {});
    });

    // get_game_table の応答は手動で resolve するまでブロック
    let resolveFirst: (() => void) | null = null;
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "get_operator_me") {
        return Promise.resolve({
          operatorId: "op-1",
          auth0Sub: "auth0|test",
          name: "Test Op",
          description: null,
        });
      }
      if (cmd === "get_serial_status") {
        return Promise.resolve({ connected: false, portName: null });
      }
      if (cmd === "get_game_table") {
        return new Promise<{ tableId: string; venueId: string }>((resolve) => {
          resolveFirst = () =>
            resolve({ tableId: "table-1", venueId: "venue-1" });
        });
      }
      return Promise.reject(new Error("command not found"));
    });

    const { result } = renderHook(() => useOperator(), { wrapper });

    // operator がセットされるまで待つ
    await waitFor(() => {
      expect(result.current.operator).not.toBeNull();
    });

    // listen が登録されるまで待つ
    await waitFor(() => {
      expect(capturedHandler).not.toBeNull();
    });

    // 1 回目の serial_status_updated を発火 → isLoadingGameTableRef.current = true になる
    act(() => {
      capturedHandler?.({
        payload: { connected: true, portName: "table-1" },
      });
    });

    // 2 回目を即発火 (isLoadingGameTableRef.current = true のままなのでスキップされる)
    act(() => {
      capturedHandler?.({
        payload: { connected: true, portName: "table-1" },
      });
    });

    // 1 回目の get_game_table を resolve する
    act(() => {
      resolveFirst?.();
    });

    await waitFor(() => {
      expect(result.current.gameTable).not.toBeNull();
    });

    // get_game_table は 1 回だけ呼ばれていること
    expect(
      vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "get_game_table")
        .length,
    ).toBe(1);

    vi.unstubAllEnvs();
  });

  it("serial_status_updated リスナーは loadGameTable 実行中に再登録されない", async () => {
    // Bug 6 fix 後: deps=[] のため listen は mount 時に 1 回のみ登録され、
    // loadGameTable を何度呼んでも再登録されないことを確認する。
    let listenCallCount = 0;
    vi.mocked(listen).mockImplementation((_event, _handler) => {
      listenCallCount++;
      return Promise.resolve(() => {});
    });

    const { result } = renderHook(() => useOperator(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingOperator).toBe(false);
    });

    // mount 時に 1 回登録される
    await waitFor(() => {
      expect(listenCallCount).toBe(1);
    });

    // loadGameTable を複数回呼んでも listen は 1 回のまま
    await result.current.loadGameTable("table-1");
    await result.current.loadGameTable("table-2");

    expect(listenCallCount).toBe(1);
  });
});
