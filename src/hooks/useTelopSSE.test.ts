/**
 * @vitest-environment jsdom
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTelopSSE } from "./useTelopSSE";

describe("useTelopSSE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルト: listen は何もしない unlisten を返す
    vi.mocked(listen).mockResolvedValue(() => {});
  });

  it("初期状態のデフォルト値を返す", async () => {
    // invoke が全て失敗する場合はデフォルト値のまま
    vi.mocked(invoke).mockRejectedValue(new Error("not implemented"));

    const { result } = renderHook(() => useTelopSSE());

    expect(result.current.telopId).toBe("modern");
    expect(result.current.backgroundColor).toBe("#00ff00");
    expect(result.current.currentScreen).toBeNull();
    expect(result.current.board).toBeNull();
  });

  it("invoke から初期値を取得して状態を更新する", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_telop_id") return "broadcast";
      if (cmd === "get_telop_background_color") return "#123456";
      if (cmd === "get_telop_current_screen") return "playing";
      if (cmd === "get_board") return { handNumber: 5, players: [] };
      return null;
    });

    const { result } = renderHook(() => useTelopSSE());

    await vi.waitFor(() => {
      expect(result.current.telopId).toBe("broadcast");
    });

    expect(result.current.backgroundColor).toBe("#123456");
    expect(result.current.currentScreen).toBe("playing");
    expect(result.current.board).toEqual({ handNumber: 5, players: [] });
  });

  it("telop_id_updated イベントで telopId が更新される", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("not implemented"));

    let telopIdHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "telop_id_updated") {
          telopIdHandler = handler;
        }
        return () => {};
      },
    );

    const { result } = renderHook(() => useTelopSSE());

    await vi.waitFor(() => expect(telopIdHandler).toBeDefined());

    act(() => {
      telopIdHandler?.({ payload: "classic" });
    });

    expect(result.current.telopId).toBe("classic");
  });

  it("telop_background_color_updated イベントで backgroundColor が更新される", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("not implemented"));

    let colorHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "telop_background_color_updated") {
          colorHandler = handler;
        }
        return () => {};
      },
    );

    const { result } = renderHook(() => useTelopSSE());

    await vi.waitFor(() => expect(colorHandler).toBeDefined());

    act(() => {
      colorHandler?.({ payload: "#abcdef" });
    });

    expect(result.current.backgroundColor).toBe("#abcdef");
  });

  it("telop_current_screen_updated イベントで currentScreen が更新される", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("not implemented"));

    let screenHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "telop_current_screen_updated") {
          screenHandler = handler;
        }
        return () => {};
      },
    );

    const { result } = renderHook(() => useTelopSSE());

    await vi.waitFor(() => expect(screenHandler).toBeDefined());

    act(() => {
      screenHandler?.({ payload: "manual-setting" });
    });

    expect(result.current.currentScreen).toBe("manual-setting");
  });

  it("board_updated イベントで board が更新される", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("not implemented"));

    const fakeBoard = {
      handNumber: 10,
      players: [{ name: "Alice" }],
    };

    let boardHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "board_updated") {
          boardHandler = handler;
        }
        return () => {};
      },
    );

    const { result } = renderHook(() => useTelopSSE());

    await vi.waitFor(() => expect(boardHandler).toBeDefined());

    act(() => {
      boardHandler?.({ payload: fakeBoard });
    });

    expect(result.current.board).toEqual(fakeBoard);
  });

  it("board_updated で null を受け取ったとき board が null になる", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_board") return { handNumber: 1, players: [] };
      throw new Error("not implemented");
    });

    let boardHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "board_updated") {
          boardHandler = handler;
        }
        return () => {};
      },
    );

    const { result } = renderHook(() => useTelopSSE());

    // 初期値が設定されるのを待つ
    await vi.waitFor(() => {
      expect(result.current.board).toEqual({ handNumber: 1, players: [] });
    });

    // null を受信
    act(() => {
      boardHandler?.({ payload: null });
    });

    expect(result.current.board).toBeNull();
  });

  it("invoke が例外を投げても初期値のままクラッシュしない", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Rust command not found"));

    expect(() => {
      renderHook(() => useTelopSSE());
    }).not.toThrow();
  });
});
