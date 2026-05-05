import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../api/client";
import { useCardPlacedHandler } from "./useCardPlacedHandler";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe("useCardPlacedHandler", () => {
  let onCardPlacedCb: ((payload: unknown) => Promise<void>) | undefined;
  let onCardPlacedUnregisteredCb: (() => void) | undefined;
  let onCardPlacedNoBoardCb: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(api.notifications, "onCardPlaced").mockImplementation(
      async (cb) => {
        onCardPlacedCb = cb as (payload: unknown) => Promise<void>;
        return () => {};
      },
    );

    vi.spyOn(api.notifications, "onCardPlacedUnregistered").mockImplementation(
      async (cb) => {
        onCardPlacedUnregisteredCb = cb;
        return () => {};
      },
    );

    vi.spyOn(api.notifications, "onCardPlacedNoBoard").mockImplementation(
      async (cb) => {
        onCardPlacedNoBoardCb = cb;
        return () => {};
      },
    );

    vi.spyOn(api.rfid, "applyCardPlaced").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without error", () => {
    const { result } = renderHook(() => useCardPlacedHandler());
    expect(result.current.eventHistory).toEqual([]);
  });

  it("calls applyCardPlaced when card_placed event received", async () => {
    const { result } = renderHook(() => useCardPlacedHandler());

    const payload = {
      rfid: "A1B2C3D4E5F678",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "communityCard" as const, slot: 0 },
    };

    await act(async () => {
      await onCardPlacedCb?.(payload);
    });

    expect(api.rfid.applyCardPlaced).toHaveBeenCalledWith(
      payload.rfid,
      payload.card,
      payload.position,
    );
    expect(result.current.eventHistory).toHaveLength(1);
  });

  it("skips duplicate events", async () => {
    const { result } = renderHook(() => useCardPlacedHandler());

    const payload = {
      rfid: "A1B2C3D4E5F678",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "communityCard" as const, slot: 0 },
    };

    await act(async () => {
      await onCardPlacedCb?.(payload);
    });

    // 同一イベントを再度送信 → スキップされる
    await act(async () => {
      await onCardPlacedCb?.(payload);
    });

    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(1);
    expect(result.current.eventHistory).toHaveLength(1);
  });

  it("shows error toast on applyCardPlaced failure and rolls back history", async () => {
    const toast = await import("react-hot-toast");
    vi.spyOn(api.rfid, "applyCardPlaced").mockRejectedValue(
      new Error("test error"),
    );

    const { result } = renderHook(() => useCardPlacedHandler());

    const payload = {
      rfid: "A1B2C3D4E5F678",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "playerHand" as const, seat: 1 },
    };

    await act(async () => {
      await onCardPlacedCb?.(payload);
    });

    expect(toast.default.error).toHaveBeenCalledWith("test error");
    // ロールバックにより履歴は空
    expect(result.current.eventHistory).toHaveLength(0);
  });

  it("shows error toast when unregistered card event received", async () => {
    const toast = await import("react-hot-toast");
    renderHook(() => useCardPlacedHandler());

    await act(async () => {
      onCardPlacedUnregisteredCb?.();
    });

    expect(toast.default.error).toHaveBeenCalledWith(
      "デッキに登録されていないカードです",
    );
  });

  it("shows error toast when no board event received", async () => {
    const toast = await import("react-hot-toast");
    renderHook(() => useCardPlacedHandler());

    await act(async () => {
      onCardPlacedNoBoardCb?.();
    });

    expect(toast.default.error).toHaveBeenCalledWith(
      "ゲームが開始されていません",
    );
  });

  it("clearEventHistory resets history", async () => {
    const { result } = renderHook(() => useCardPlacedHandler());

    const payload = {
      rfid: "A1B2C3D4E5F678",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "burnCard" as const },
    };

    await act(async () => {
      await onCardPlacedCb?.(payload);
    });
    expect(result.current.eventHistory).toHaveLength(1);

    act(() => {
      result.current.clearEventHistory();
    });
    expect(result.current.eventHistory).toHaveLength(0);
  });

  it("clearEventHistory 後に同一イベントを再送しても新規イベントとして処理される", async () => {
    const { result } = renderHook(() => useCardPlacedHandler());

    const payload = {
      rfid: "A1B2C3D4E5F678",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "communityCard" as const, slot: 0 },
    };

    // 1回目スキャン
    await act(async () => {
      await onCardPlacedCb?.(payload);
    });
    expect(result.current.eventHistory).toHaveLength(1);
    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(1);

    // クリア
    act(() => {
      result.current.clearEventHistory();
    });
    expect(result.current.eventHistory).toHaveLength(0);

    // 同一イベントを再送 → ref もクリアされているため重複とみなされず処理される
    await act(async () => {
      await onCardPlacedCb?.(payload);
    });
    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(2);
    expect(result.current.eventHistory).toHaveLength(1);
  });

  it("logs error when listener registration fails (setup rejects)", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(api.notifications, "onCardPlaced").mockRejectedValue(
      new Error("Tauri not connected"),
    );

    renderHook(() => useCardPlacedHandler());

    // setup() は非同期で失敗する — マイクロタスクを消化させる
    await act(async () => {
      await Promise.resolve();
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[useCardPlacedHandler] failed to register listener",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("drops oldest events when history exceeds MAX_EVENT_HISTORY (200)", async () => {
    const { result } = renderHook(() => useCardPlacedHandler());

    // 201 件のユニークなイベントを順に送信する
    for (let i = 0; i < 201; i++) {
      const payload = {
        rfid: `RFID${String(i).padStart(10, "0")}`,
        card: { suit: "spade" as const, value: "A" as const },
        position: { type: "communityCard" as const, slot: 0 },
      };
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await onCardPlacedCb?.(payload);
      });
    }

    // 上限は 200 件
    expect(result.current.eventHistory).toHaveLength(200);

    // 最も古いイベント（index=0）は破棄されていること
    // 意味的キー形式: "rfid|suit:value|posKey"
    const firstEventKey = "RFID0000000000|spade:A|cc:0";
    expect(result.current.eventHistory).not.toContain(firstEventKey);

    // 最も新しいイベント（index=200）は残っていること
    const lastEventKey = "RFID0000000200|spade:A|cc:0";
    expect(result.current.eventHistory).toContain(lastEventKey);
  });

  it("処理中に到着した次のイベントがドロップされず逐次処理される", async () => {
    let resolveFirst!: () => void;
    const firstCallPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    let applyCallCount = 0;
    vi.spyOn(api.rfid, "applyCardPlaced").mockImplementation(async () => {
      applyCallCount += 1;
      if (applyCallCount === 1) {
        await firstCallPromise;
      }
    });

    const { result } = renderHook(() => useCardPlacedHandler());

    const payload1 = {
      rfid: "RFID00000000001",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "communityCard" as const, slot: 0 },
    };
    const payload2 = {
      rfid: "RFID00000000002",
      card: { suit: "heart" as const, value: "K" as const },
      position: { type: "communityCard" as const, slot: 1 },
    };

    // 1件目の処理を開始し、処理中に2件目をキューへ積んで1件目を完了させる
    await act(async () => {
      const firstDone = onCardPlacedCb?.(payload1);
      // 2件目は処理中にキューへ積まれる（await しないので processingRef.current === true のまま）
      void onCardPlacedCb?.(payload2);
      // 1件目を完了させ、finallyでキューを処理させる
      resolveFirst();
      await firstDone;
    });

    // 両方が処理されること
    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(2);
    expect(result.current.eventHistory).toHaveLength(2);
  });

  it("onCardPlaced 登録後 / onCardPlacedUnregistered 登録前にアンマウントしても unlistenCardPlaced が呼ばれる", async () => {
    // onCardPlaced の unlisten spy
    const unlistenCardPlacedSpy = vi.fn();
    // onCardPlacedUnregistered は解決を保留にしてアンマウントのタイミングをシミュレート
    let resolveUnregistered!: (fn: () => void) => void;
    const unregisteredPromise = new Promise<() => void>((resolve) => {
      resolveUnregistered = resolve;
    });

    vi.spyOn(api.notifications, "onCardPlaced").mockResolvedValue(
      unlistenCardPlacedSpy,
    );
    vi.spyOn(api.notifications, "onCardPlacedUnregistered").mockImplementation(
      (_cb) => unregisteredPromise,
    );

    const { unmount } = renderHook(() => useCardPlacedHandler());

    // onCardPlaced が完了するまでマイクロタスクを消化
    await act(async () => {
      await Promise.resolve();
    });

    // この時点で onCardPlacedUnregistered の await が保留中 → アンマウント
    unmount();

    // onCardPlacedUnregistered を解決（アンマウント後）
    const unlistenUnregisteredSpy = vi.fn();
    await act(async () => {
      resolveUnregistered(unlistenUnregisteredSpy);
      await Promise.resolve();
    });

    // onCardPlaced のリスナーは解除されていること
    expect(unlistenCardPlacedSpy).toHaveBeenCalled();
  });
});
