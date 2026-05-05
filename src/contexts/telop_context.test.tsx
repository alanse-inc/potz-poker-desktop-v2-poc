import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { TelopId, TelopScreenState } from "../types";
import { TelopProvider, useTelop } from "./telop_context";

vi.mock("../api/client", () => ({
  api: {
    telop: {
      isOpen: vi.fn(),
    },
    telopSettings: {
      getTelopId: vi.fn(),
      setTelopId: vi.fn(),
      getBackgroundColor: vi.fn(),
      setBackgroundColor: vi.fn(),
      getCurrentScreen: vi.fn(),
      setCurrentScreen: vi.fn(),
    },
    notifications: {
      onTelopIdUpdated: vi.fn(),
      onTelopBackgroundColorUpdated: vi.fn(),
      onTelopCurrentScreenUpdated: vi.fn(),
    },
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <TelopProvider>{children}</TelopProvider>
);

describe("TelopProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.telop.isOpen).mockResolvedValue(false);
    vi.mocked(api.telopSettings.getTelopId).mockRejectedValue(
      new Error("not implemented"),
    );
    vi.mocked(api.telopSettings.getBackgroundColor).mockRejectedValue(
      new Error("not implemented"),
    );
    vi.mocked(api.telopSettings.getCurrentScreen).mockRejectedValue(
      new Error("not implemented"),
    );
    vi.mocked(api.telopSettings.setTelopId).mockResolvedValue(undefined);
    vi.mocked(api.telopSettings.setBackgroundColor).mockResolvedValue(
      undefined,
    );
    vi.mocked(api.telopSettings.setCurrentScreen).mockResolvedValue(undefined);
    vi.mocked(api.notifications.onTelopIdUpdated).mockResolvedValue(() => {});
    vi.mocked(
      api.notifications.onTelopBackgroundColorUpdated,
    ).mockResolvedValue(() => {});
    vi.mocked(api.notifications.onTelopCurrentScreenUpdated).mockResolvedValue(
      () => {},
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("デフォルト値が正しく設定される", () => {
    const { result } = renderHook(() => useTelop(), { wrapper });

    expect(result.current.telopId).toBe("modern");
    expect(result.current.isOpen).toBe(false);
    expect(result.current.backgroundColor).toBe("#00ff00");
    expect(result.current.currentScreen).toBeNull();
  });

  it("初期化時に telopSettings の getter を呼ぶ", async () => {
    renderHook(() => useTelop(), { wrapper });

    await waitFor(() => {
      expect(api.telopSettings.getTelopId).toHaveBeenCalledTimes(1);
      expect(api.telopSettings.getBackgroundColor).toHaveBeenCalledTimes(1);
      expect(api.telopSettings.getCurrentScreen).toHaveBeenCalledTimes(1);
    });
  });

  it("初期化時に Tauri イベントを購読する", async () => {
    renderHook(() => useTelop(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onTelopIdUpdated).toHaveBeenCalledTimes(1);
      expect(
        api.notifications.onTelopBackgroundColorUpdated,
      ).toHaveBeenCalledTimes(1);
      expect(
        api.notifications.onTelopCurrentScreenUpdated,
      ).toHaveBeenCalledTimes(1);
    });
  });

  it("getTelopId が値を返した場合 telopId が更新される", async () => {
    vi.mocked(api.telopSettings.getTelopId).mockResolvedValue(
      "classic" as TelopId,
    );

    const { result } = renderHook(() => useTelop(), { wrapper });

    await waitFor(() => {
      expect(result.current.telopId).toBe("classic");
    });
  });

  it("setTelopId を呼ぶと state が更新され invoke が呼ばれる", async () => {
    const { result } = renderHook(() => useTelop(), { wrapper });

    await act(async () => {
      await result.current.setTelopId("broadcast");
    });

    expect(result.current.telopId).toBe("broadcast");
    expect(api.telopSettings.setTelopId).toHaveBeenCalledWith("broadcast");
  });

  it("setBackgroundColor を呼ぶと state が更新され invoke が呼ばれる", async () => {
    const { result } = renderHook(() => useTelop(), { wrapper });

    await act(async () => {
      await result.current.setBackgroundColor("#ff0000");
    });

    expect(result.current.backgroundColor).toBe("#ff0000");
    expect(api.telopSettings.setBackgroundColor).toHaveBeenCalledWith(
      "#ff0000",
    );
  });

  it("setCurrentScreen を呼ぶと state が更新され invoke が呼ばれる", async () => {
    const { result } = renderHook(() => useTelop(), { wrapper });

    await act(async () => {
      await result.current.setCurrentScreen("playing" as TelopScreenState);
    });

    expect(result.current.currentScreen).toBe("playing");
    expect(api.telopSettings.setCurrentScreen).toHaveBeenCalledWith("playing");
  });

  it("setIsOpen を呼ぶと isOpen が更新される", () => {
    const { result } = renderHook(() => useTelop(), { wrapper });

    act(() => {
      result.current.setIsOpen(true);
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("onTelopIdUpdated コールバックが呼ばれると telopId が更新される", async () => {
    let capturedCb: ((id: TelopId) => void) | undefined;
    vi.mocked(api.notifications.onTelopIdUpdated).mockImplementation(
      async (cb) => {
        capturedCb = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useTelop(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onTelopIdUpdated).toHaveBeenCalledTimes(1);
    });

    act(() => {
      capturedCb?.("basic");
    });

    await waitFor(() => {
      expect(result.current.telopId).toBe("basic");
    });
  });

  it("onTelopBackgroundColorUpdated コールバックが呼ばれると backgroundColor が更新される", async () => {
    let capturedCb: ((color: string) => void) | undefined;
    vi.mocked(
      api.notifications.onTelopBackgroundColorUpdated,
    ).mockImplementation(async (cb) => {
      capturedCb = cb;
      return () => {};
    });

    const { result } = renderHook(() => useTelop(), { wrapper });

    await waitFor(() => {
      expect(
        api.notifications.onTelopBackgroundColorUpdated,
      ).toHaveBeenCalledTimes(1);
    });

    act(() => {
      capturedCb?.("#0000ff");
    });

    await waitFor(() => {
      expect(result.current.backgroundColor).toBe("#0000ff");
    });
  });

  it("onTelopCurrentScreenUpdated コールバックが呼ばれると currentScreen が更新される", async () => {
    let capturedCb: ((screen: TelopScreenState) => void) | undefined;
    vi.mocked(api.notifications.onTelopCurrentScreenUpdated).mockImplementation(
      async (cb) => {
        capturedCb = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useTelop(), { wrapper });

    await waitFor(() => {
      expect(
        api.notifications.onTelopCurrentScreenUpdated,
      ).toHaveBeenCalledTimes(1);
    });

    act(() => {
      capturedCb?.("manual-setting");
    });

    await waitFor(() => {
      expect(result.current.currentScreen).toBe("manual-setting");
    });
  });

  it("アンマウント時に全 unlisten が呼ばれる", async () => {
    const unlistenId = vi.fn();
    const unlistenColor = vi.fn();
    const unlistenScreen = vi.fn();

    vi.mocked(api.notifications.onTelopIdUpdated).mockResolvedValue(unlistenId);
    vi.mocked(
      api.notifications.onTelopBackgroundColorUpdated,
    ).mockResolvedValue(unlistenColor);
    vi.mocked(api.notifications.onTelopCurrentScreenUpdated).mockResolvedValue(
      unlistenScreen,
    );

    const { unmount } = renderHook(() => useTelop(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onTelopIdUpdated).toHaveBeenCalledTimes(1);
    });

    unmount();

    await waitFor(() => {
      expect(unlistenId).toHaveBeenCalledTimes(1);
      expect(unlistenColor).toHaveBeenCalledTimes(1);
      expect(unlistenScreen).toHaveBeenCalledTimes(1);
    });
  });

  it("初期化時に api.telop.isOpen() が呼ばれ isOpen が同期される", async () => {
    vi.mocked(api.telop.isOpen).mockResolvedValue(true);

    const { result } = renderHook(() => useTelop(), { wrapper });

    await waitFor(() => {
      expect(api.telop.isOpen).toHaveBeenCalledTimes(1);
      expect(result.current.isOpen).toBe(true);
    });
  });

  it("ポーリングにより isOpen が定期的に同期される", async () => {
    vi.useFakeTimers();
    vi.mocked(api.telop.isOpen).mockResolvedValue(false);

    const { result } = renderHook(() => useTelop(), { wrapper });

    // 初期化非同期処理が完了するまで待つ
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOpen).toBe(false);

    // telop ウィンドウが開かれた状態をシミュレート
    vi.mocked(api.telop.isOpen).mockResolvedValue(true);

    // 1 秒後のポーリングを進め、PromiseQueue を flush する
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("ポーリングでウィンドウが閉じられたことを検知して isOpen が false になる", async () => {
    vi.useFakeTimers();
    vi.mocked(api.telop.isOpen).mockResolvedValue(true);

    const { result } = renderHook(() => useTelop(), { wrapper });

    // 初期化非同期処理が完了するまで待つ
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOpen).toBe(true);

    // OS の close ボタンでウィンドウが閉じられた状態をシミュレート
    vi.mocked(api.telop.isOpen).mockResolvedValue(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.isOpen).toBe(false);
  });
});
