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
});
