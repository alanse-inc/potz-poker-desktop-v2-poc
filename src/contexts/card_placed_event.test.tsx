import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { CardPlacedPayload } from "../types";
import {
  CardPlacedEventProvider,
  useCardPlacedEvent,
} from "./card_placed_event";

vi.mock("../api/client", () => ({
  api: {
    notifications: {
      onCardPlaced: vi.fn(),
    },
  },
}));

const makeCardPlacedPayload = (
  override: Partial<CardPlacedPayload> = {},
): CardPlacedPayload => ({
  rfid: "RFID_001",
  card: { suit: "spade", value: "A" },
  position: { type: "playerHand", seat: 0 },
  ...override,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <CardPlacedEventProvider>{children}</CardPlacedEventProvider>
);

describe("CardPlacedEventProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.notifications.onCardPlaced).mockResolvedValue(() => {});
  });

  it("初期状態で placedEvent は null", () => {
    const { result } = renderHook(() => useCardPlacedEvent(), { wrapper });

    expect(result.current.placedEvent).toBeNull();
  });

  it("初期化時に onCardPlaced を購読する", async () => {
    renderHook(() => useCardPlacedEvent(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onCardPlaced).toHaveBeenCalledTimes(1);
    });
  });

  it("onCardPlaced のコールバックが呼ばれると placedEvent が更新される", async () => {
    let capturedCb: ((payload: CardPlacedPayload) => void) | undefined;
    vi.mocked(api.notifications.onCardPlaced).mockImplementation(async (cb) => {
      capturedCb = cb;
      return () => {};
    });

    const { result } = renderHook(() => useCardPlacedEvent(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onCardPlaced).toHaveBeenCalledTimes(1);
    });

    const payload = makeCardPlacedPayload();
    act(() => {
      capturedCb?.(payload);
    });

    await waitFor(() => {
      expect(result.current.placedEvent).toEqual(payload);
    });
  });

  it("clearPlacedEvent を呼ぶと placedEvent が null になる", async () => {
    let capturedCb: ((payload: CardPlacedPayload) => void) | undefined;
    vi.mocked(api.notifications.onCardPlaced).mockImplementation(async (cb) => {
      capturedCb = cb;
      return () => {};
    });

    const { result } = renderHook(() => useCardPlacedEvent(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onCardPlaced).toHaveBeenCalledTimes(1);
    });

    act(() => {
      capturedCb?.(makeCardPlacedPayload());
    });

    await waitFor(() => {
      expect(result.current.placedEvent).not.toBeNull();
    });

    act(() => {
      result.current.clearPlacedEvent();
    });

    expect(result.current.placedEvent).toBeNull();
  });

  it("manualSetPlacedEvent を呼ぶと placedEvent が更新される", () => {
    const { result } = renderHook(() => useCardPlacedEvent(), { wrapper });

    const payload = makeCardPlacedPayload({ rfid: "MANUAL_001" });

    act(() => {
      result.current.manualSetPlacedEvent(payload);
    });

    expect(result.current.placedEvent).toEqual(payload);
  });

  it("アンマウント時に unlisten が呼ばれる", async () => {
    const unsubscribe = vi.fn();
    vi.mocked(api.notifications.onCardPlaced).mockResolvedValue(unsubscribe);

    const { unmount } = renderHook(() => useCardPlacedEvent(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onCardPlaced).toHaveBeenCalledTimes(1);
    });

    unmount();

    await waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });
});
