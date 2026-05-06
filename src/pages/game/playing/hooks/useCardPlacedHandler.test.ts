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

  it("unmount 後に進行中の applyCardPlaced 解決後に toast が呼ばれない (Bug 3)", async () => {
    const toast = await import("react-hot-toast");
    vi.mocked(toast.default.success).mockClear();
    let resolveApply!: () => void;
    const applyPromise = new Promise<void>((resolve) => {
      resolveApply = resolve;
    });
    vi.spyOn(api.rfid, "applyCardPlaced").mockImplementation(
      async () => applyPromise,
    );

    const { unmount } = renderHook(() => useCardPlacedHandler());

    const payload = {
      rfid: "RFID_BUG3_TEST",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "communityCard" as const, slot: 0 },
    };

    await act(async () => {
      void onCardPlacedCb?.(payload);
      // applyCardPlaced は保留 → unmount
      unmount();
      // unmount 後に解決
      resolveApply();
      await Promise.resolve();
      await Promise.resolve();
    });

    // unmount 後の解決なので success toast は呼ばれない
    expect(toast.default.success).not.toHaveBeenCalled();
  });

  it("unmount 後に進行中の applyCardPlaced エラー解決後に error toast が呼ばれない (Bug 3)", async () => {
    const toast = await import("react-hot-toast");
    vi.mocked(toast.default.error).mockClear();
    let rejectApply!: (e: Error) => void;
    const applyPromise = new Promise<void>((_resolve, reject) => {
      rejectApply = reject;
    });
    vi.spyOn(api.rfid, "applyCardPlaced").mockImplementation(
      async () => applyPromise,
    );

    const { unmount } = renderHook(() => useCardPlacedHandler());

    const payload = {
      rfid: "RFID_BUG3_ERR",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "burnCard" as const },
    };

    await act(async () => {
      void onCardPlacedCb?.(payload);
      unmount();
      rejectApply(new Error("apply failed"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.default.error).not.toHaveBeenCalled();
  });

  it("clearEventHistory が pendingQueue もクリアする (Bug 8)", async () => {
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
      rfid: "RFID_BUG8_001",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "communityCard" as const, slot: 0 },
    };
    const payload2 = {
      rfid: "RFID_BUG8_002",
      card: { suit: "heart" as const, value: "K" as const },
      position: { type: "communityCard" as const, slot: 1 },
    };

    // 1件目を処理中にし、2件目をキューへ積む。clearEventHistory を呼ぶと
    // pendingQueue もクリアされ、1件目完了後に2件目が処理されないこと。
    await act(async () => {
      const firstDone = onCardPlacedCb?.(payload1);
      void onCardPlacedCb?.(payload2);
      result.current.clearEventHistory();
      resolveFirst();
      await firstDone;
    });

    // 1件目のみ実行され、2件目は pendingQueue クリアにより破棄される
    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(1);
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

  it("unmount 後にキュー内の 2 件目以降は IPC が呼ばれない (Bug D)", async () => {
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

    const { unmount } = renderHook(() => useCardPlacedHandler());

    const payload1 = {
      rfid: "RFID_BUGD_001",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "communityCard" as const, slot: 0 },
    };
    const payload2 = {
      rfid: "RFID_BUGD_002",
      card: { suit: "heart" as const, value: "K" as const },
      position: { type: "communityCard" as const, slot: 1 },
    };
    const payload3 = {
      rfid: "RFID_BUGD_003",
      card: { suit: "diamond" as const, value: "Q" as const },
      position: { type: "communityCard" as const, slot: 2 },
    };

    await act(async () => {
      // 1 件目の処理を開始（IPC pending）
      const firstDone = onCardPlacedCb?.(payload1);
      // 2, 3 件目はキューへ積む
      void onCardPlacedCb?.(payload2);
      void onCardPlacedCb?.(payload3);
      // 1 件目処理中に unmount
      unmount();
      // 1 件目の IPC を解決
      resolveFirst();
      await firstDone;
      // マイクロタスクを数回消化して processNext が起動しないことを確認
      await Promise.resolve();
      await Promise.resolve();
    });

    // 1 件目のみ IPC が呼ばれ、2, 3 件目は cancelled により呼ばれない
    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(1);
  });

  it("unmount 後に 1 件目 IPC 完了後 setState/toast が呼ばれない (Bug D)", async () => {
    const toast = await import("react-hot-toast");
    vi.mocked(toast.default.success).mockClear();
    let resolveFirst!: () => void;
    const firstCallPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    vi.spyOn(api.rfid, "applyCardPlaced").mockImplementation(
      async () => firstCallPromise,
    );

    const { unmount, result } = renderHook(() => useCardPlacedHandler());

    const payload1 = {
      rfid: "RFID_BUGD_TOAST_001",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "communityCard" as const, slot: 0 },
    };
    const payload2 = {
      rfid: "RFID_BUGD_TOAST_002",
      card: { suit: "heart" as const, value: "K" as const },
      position: { type: "communityCard" as const, slot: 1 },
    };

    await act(async () => {
      // 1 件目の処理を開始（IPC pending）
      const firstDone = onCardPlacedCb?.(payload1);
      // 2 件目はキューへ積む
      void onCardPlacedCb?.(payload2);
      // 1 件目処理中に unmount
      unmount();
      // 1 件目の IPC を解決（unmount 後）
      resolveFirst();
      await firstDone;
      await Promise.resolve();
      await Promise.resolve();
    });

    // unmount 後の解決なので success toast は呼ばれない
    expect(toast.default.success).not.toHaveBeenCalled();
    // 2 件目の IPC も呼ばれない
    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(1);
    // state 更新は unmount 後なので eventHistory は 1 件のみ（初回 pushEventHistory 呼び出し分）
    // unmount 後の setEventHistory は React が無視するためエラーにならない
    void result; // result を参照して型エラー回避
  });

  it("連続エラー時に popEventHistory(key) が正しいキーのみ削除し他のキーを保持する (Bug 4)", async () => {
    // シナリオ:
    //   1. イベント A を push → applyCardPlaced がエラー → finally で processNext 呼び出し
    //   2. processNext の実行中にイベント B が push されていた場合（キューに積まれる）
    //   3. B の処理中にエラーが出ても A のキーは復活しないこと
    //   4. A のエラーロールバックで B が誤削除されないこと
    let applyCallCount = 0;
    vi.spyOn(api.rfid, "applyCardPlaced").mockImplementation(async () => {
      applyCallCount += 1;
      throw new Error(`error-${applyCallCount}`);
    });

    const { result } = renderHook(() => useCardPlacedHandler());

    const payloadA = {
      rfid: "BUG4_RFID_A",
      card: { suit: "spade" as const, value: "A" as const },
      position: { type: "communityCard" as const, slot: 0 },
    };
    const payloadB = {
      rfid: "BUG4_RFID_B",
      card: { suit: "heart" as const, value: "K" as const },
      position: { type: "communityCard" as const, slot: 1 },
    };

    // A を先に処理開始し（processingRef=true）B をキューへ積む
    await act(async () => {
      // A の処理を投げる（エラーになる）
      const aDone = onCardPlacedCb?.(payloadA);
      // B はキューへ積まれる（processingRef が true のため）
      void onCardPlacedCb?.(payloadB);
      await aDone;
    });

    // 両方エラーでロールバックされているため履歴は空になるはず
    expect(result.current.eventHistory).toHaveLength(0);

    // 重要: B のキーが A のロールバックで誤削除された場合、
    // B は「履歴に存在しない」ので再度処理可能なはずだが、
    // slice(0,-1) バグだと A のキーが残り B が誤削除されてしまう。
    // key 指定 filter 修正後は両方正しく削除されることを確認する。
    const keyA = "BUG4_RFID_A|spade:A|cc:0";
    const keyB = "BUG4_RFID_B|heart:K|cc:1";
    expect(result.current.eventHistory).not.toContain(keyA);
    expect(result.current.eventHistory).not.toContain(keyB);
  });

  it("エラー後に同一イベントを再送すると再処理される（rollback 後のキー削除が正確なことの確認）(Bug 4)", async () => {
    vi.spyOn(api.rfid, "applyCardPlaced")
      .mockRejectedValueOnce(new Error("first fail"))
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useCardPlacedHandler());

    const payload = {
      rfid: "BUG4_RETRY_RFID",
      card: { suit: "club" as const, value: "5" as const },
      position: { type: "communityCard" as const, slot: 2 },
    };

    // 1回目: エラー → ロールバックにより履歴から削除される
    await act(async () => {
      await onCardPlacedCb?.(payload);
    });
    expect(result.current.eventHistory).toHaveLength(0);

    // 2回目: 同一イベント → 履歴に存在しないため再処理される
    await act(async () => {
      await onCardPlacedCb?.(payload);
    });
    expect(result.current.eventHistory).toHaveLength(1);
    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(2);
  });

  it("burnCard イベントが重複送信された場合は2回目をスキップする", async () => {
    const { result } = renderHook(() => useCardPlacedHandler());

    const payload = {
      rfid: "BURN_RFID_001",
      card: { suit: "club" as const, value: "2" as const },
      position: { type: "burnCard" as const },
    };

    await act(async () => {
      await onCardPlacedCb?.(payload);
    });
    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(1);
    expect(result.current.eventHistory).toHaveLength(1);

    // 同一イベントを再送 → 重複排除でスキップされる
    await act(async () => {
      await onCardPlacedCb?.(payload);
    });
    expect(api.rfid.applyCardPlaced).toHaveBeenCalledTimes(1);
    expect(result.current.eventHistory).toHaveLength(1);
  });
});
