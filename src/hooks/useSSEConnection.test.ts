/**
 * @vitest-environment jsdom
 */
import { listen } from "@tauri-apps/api/event";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SSECallback } from "./useSSEConnection";
import { useSSEConnection } from "./useSSEConnection";

// setup.ts で listen がグローバルモックされているが、
// テストごとにカスタム実装に上書きして handler を捕捉する
describe("useSSEConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("マウント時に全 Tauri イベントを listen する", async () => {
    // listen が呼ばれた event 名を記録
    const registeredEvents: string[] = [];
    vi.mocked(listen).mockImplementation(async (eventName) => {
      registeredEvents.push(eventName as string);
      return () => {};
    });

    renderHook(() => useSSEConnection(() => {}));

    // Promise の解決を待つ
    await vi.waitFor(() => {
      expect(registeredEvents.length).toBeGreaterThanOrEqual(7);
    });

    expect(registeredEvents).toContain("board_updated");
    expect(registeredEvents).toContain("initial_board_updated");
    expect(registeredEvents).toContain("telop_id_updated");
    expect(registeredEvents).toContain("telop_background_color_updated");
    expect(registeredEvents).toContain("telop_current_screen_updated");
    expect(registeredEvents).toContain("card_placed");
    expect(registeredEvents).toContain("serial_status_updated");
  });

  it("board_updated イベント受信時に onEvent が board-updated で呼ばれる", async () => {
    const fakeBoard = {
      handNumber: 1,
      players: [],
    } as unknown as Parameters<SSECallback>[0] & { event: "board-updated" };

    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "board_updated") {
          capturedHandler = handler;
        }
        return () => {};
      },
    );

    const onEvent = vi.fn<SSECallback>();
    renderHook(() => useSSEConnection(onEvent));

    await vi.waitFor(() => expect(capturedHandler).toBeDefined());

    capturedHandler?.({ payload: fakeBoard });

    expect(onEvent).toHaveBeenCalledWith({
      event: "board-updated",
      data: fakeBoard,
    });
  });

  it("initial_board_updated イベント受信時に onEvent が initial-board-updated で呼ばれる", async () => {
    const fakeBoard = { handNumber: 2, players: [] } as unknown;

    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "initial_board_updated") {
          capturedHandler = handler;
        }
        return () => {};
      },
    );

    const onEvent = vi.fn<SSECallback>();
    renderHook(() => useSSEConnection(onEvent));

    await vi.waitFor(() => expect(capturedHandler).toBeDefined());

    capturedHandler?.({ payload: fakeBoard });

    expect(onEvent).toHaveBeenCalledWith({
      event: "initial-board-updated",
      data: fakeBoard,
    });
  });

  it("telop_id_updated イベント受信時に onEvent が telop-updated (type: telop-id) で呼ばれる", async () => {
    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "telop_id_updated") {
          capturedHandler = handler;
        }
        return () => {};
      },
    );

    const onEvent = vi.fn<SSECallback>();
    renderHook(() => useSSEConnection(onEvent));

    await vi.waitFor(() => expect(capturedHandler).toBeDefined());

    capturedHandler?.({ payload: "modern" });

    expect(onEvent).toHaveBeenCalledWith({
      event: "telop-updated",
      data: { type: "telop-id", telopId: "modern" },
    });
  });

  it("telop_background_color_updated イベント受信時に onEvent が telop-updated (type: background-color) で呼ばれる", async () => {
    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "telop_background_color_updated") {
          capturedHandler = handler;
        }
        return () => {};
      },
    );

    const onEvent = vi.fn<SSECallback>();
    renderHook(() => useSSEConnection(onEvent));

    await vi.waitFor(() => expect(capturedHandler).toBeDefined());

    capturedHandler?.({ payload: "#ff0000" });

    expect(onEvent).toHaveBeenCalledWith({
      event: "telop-updated",
      data: { type: "background-color", color: "#ff0000" },
    });
  });

  it("telop_current_screen_updated イベント受信時に onEvent が telop-updated (type: current-screen) で呼ばれる", async () => {
    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "telop_current_screen_updated") {
          capturedHandler = handler;
        }
        return () => {};
      },
    );

    const onEvent = vi.fn<SSECallback>();
    renderHook(() => useSSEConnection(onEvent));

    await vi.waitFor(() => expect(capturedHandler).toBeDefined());

    capturedHandler?.({ payload: "playing" });

    expect(onEvent).toHaveBeenCalledWith({
      event: "telop-updated",
      data: { type: "current-screen", screen: "playing" },
    });
  });

  it("card_placed イベント受信時に onEvent が card-placed で呼ばれる", async () => {
    const fakePayload = {
      rfid: "A1B2C3D4",
      card: { suit: "spade", value: "A" },
      position: { type: "communityCard", slot: 0 },
    };

    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "card_placed") {
          capturedHandler = handler;
        }
        return () => {};
      },
    );

    const onEvent = vi.fn<SSECallback>();
    renderHook(() => useSSEConnection(onEvent));

    await vi.waitFor(() => expect(capturedHandler).toBeDefined());

    capturedHandler?.({ payload: fakePayload });

    expect(onEvent).toHaveBeenCalledWith({
      event: "card-placed",
      data: fakePayload,
    });
  });

  it("serial_status_updated イベント受信時に onEvent が connection-status-updated で呼ばれる", async () => {
    const fakeStatus = { connected: true, portName: "/dev/tty.usbmodem1234" };

    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (eventName, handler: (e: { payload: unknown }) => void) => {
        if (eventName === "serial_status_updated") {
          capturedHandler = handler;
        }
        return () => {};
      },
    );

    const onEvent = vi.fn<SSECallback>();
    renderHook(() => useSSEConnection(onEvent));

    await vi.waitFor(() => expect(capturedHandler).toBeDefined());

    capturedHandler?.({ payload: fakeStatus });

    expect(onEvent).toHaveBeenCalledWith({
      event: "connection-status-updated",
      data: fakeStatus,
    });
  });

  it("アンマウント時に全アンリスン関数が呼ばれる", async () => {
    const unlistenFns: ReturnType<typeof vi.fn>[] = [];
    vi.mocked(listen).mockImplementation(async () => {
      const unlistenFn = vi.fn();
      unlistenFns.push(unlistenFn);
      return unlistenFn;
    });

    const { unmount } = renderHook(() => useSSEConnection(() => {}));

    // 全 listen の Promise が解決するまで待つ
    await vi.waitFor(() =>
      expect(unlistenFns.length).toBeGreaterThanOrEqual(7),
    );

    unmount();

    // cleanup 内の p.then((fn) => fn()) は非同期のため、解決を待つ
    await vi.waitFor(() => {
      for (const fn of unlistenFns) {
        expect(fn).toHaveBeenCalled();
      }
    });
  });

  it("cleanup race: unmount 前に listen Promise が解決していなくても unlisten が呼ばれる", async () => {
    // 各 listen Promise の resolve を手動で制御する
    const resolvers: Array<(fn: () => void) => void> = [];
    const unlistenFns: ReturnType<typeof vi.fn>[] = [];

    vi.mocked(listen).mockImplementation(async () => {
      return new Promise<() => void>((resolve) => {
        resolvers.push(resolve);
      });
    });

    const { unmount } = renderHook(() => useSSEConnection(() => {}));

    // listen が呼ばれるまで待つ（useEffect の非同期処理）
    await vi.waitFor(() => expect(resolvers.length).toBeGreaterThanOrEqual(7));

    // Promise はまだ未解決のまま unmount (cleanup race を再現)
    unmount();

    // unmount 後に全 Promise を解決する
    for (const resolver of resolvers) {
      const unlistenFn = vi.fn();
      unlistenFns.push(unlistenFn);
      resolver(unlistenFn);
    }

    // cleanup 内の p.then((fn) => fn()) の解決を待つ
    await vi.waitFor(() => {
      for (const fn of unlistenFns) {
        expect(fn).toHaveBeenCalled();
      }
    });
  });

  it("cleanup race: unmount 後に listener が発火しても onEvent が呼ばれない", async () => {
    const resolvers: Array<(fn: () => void) => void> = [];
    const handlers: Array<(e: { payload: unknown }) => void> = [];

    vi.mocked(listen).mockImplementation(
      async (_eventName, handler: (e: { payload: unknown }) => void) => {
        handlers.push(handler);
        return new Promise<() => void>((resolve) => {
          resolvers.push(resolve);
        });
      },
    );

    const onEvent = vi.fn<SSECallback>();
    const { unmount } = renderHook(() => useSSEConnection(onEvent));

    // listen Promise が登録されるまで待つ
    await vi.waitFor(() => expect(resolvers.length).toBeGreaterThan(0));

    // unmount (cancelled = true になる)
    unmount();

    // unmount 後に Promise を解決
    for (const resolver of resolvers) {
      resolver(() => {});
    }

    // unmount 後に handler を発火しても onEvent が呼ばれないこと
    for (const handler of handlers) {
      handler({ payload: null });
    }

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("onEvent コールバックが更新されても再購読しない", async () => {
    vi.mocked(listen).mockImplementation(async () => () => {});

    let listenCallCount = 0;
    vi.mocked(listen).mockImplementation(async () => {
      listenCallCount++;
      return () => {};
    });

    const { rerender } = renderHook(
      ({ cb }: { cb: SSECallback }) => useSSEConnection(cb),
      { initialProps: { cb: vi.fn<SSECallback>() } },
    );

    await vi.waitFor(() => expect(listenCallCount).toBeGreaterThanOrEqual(7));
    const countAfterMount = listenCallCount;

    // コールバックを変えて rerender
    rerender({ cb: vi.fn<SSECallback>() });
    rerender({ cb: vi.fn<SSECallback>() });

    // listen の呼び出し数は増えないはず
    expect(listenCallCount).toBe(countAfterMount);
  });
});
