import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { RfidCardMapping } from "../types";
import {
  RFIDCardMappingProvider,
  useRfidCardMapping,
} from "./rfid_card_mapping_context";

vi.mock("../api/client", () => ({
  api: {
    rfid: {
      getMapping: vi.fn(),
    },
    notifications: {
      onDeckUpdated: vi.fn(),
    },
  },
}));

const makeMapping = (
  override: Partial<RfidCardMapping> = {},
): RfidCardMapping => ({
  id: "deck-1",
  name: "Standard Deck",
  cards: {
    "rfid-001": { suit: "spade", value: "A" },
    "rfid-002": { suit: "heart", value: "K" },
  },
  ...override,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <RFIDCardMappingProvider>{children}</RFIDCardMappingProvider>
);

describe("RFIDCardMappingProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.notifications.onDeckUpdated).mockResolvedValue(() => {});
    vi.mocked(api.rfid.getMapping).mockRejectedValue(
      new Error("command not found"),
    );
  });

  it("初期状態で rfidCardMapping は null", async () => {
    const { result } = renderHook(() => useRfidCardMapping(), { wrapper });

    await waitFor(() => {
      // getMapping の呼び出しが完了するまで待機
      expect(api.rfid.getMapping).toHaveBeenCalledTimes(1);
    });

    expect(result.current.rfidCardMapping).toBeNull();
  });

  it("マウント時に api.rfid.getMapping() を呼ぶ", async () => {
    renderHook(() => useRfidCardMapping(), { wrapper });

    await waitFor(() => {
      expect(api.rfid.getMapping).toHaveBeenCalledTimes(1);
    });
  });

  it("api.rfid.getMapping() が成功するとマッピングがセットされる", async () => {
    const mapping = makeMapping();
    vi.mocked(api.rfid.getMapping).mockResolvedValue(mapping);

    const { result } = renderHook(() => useRfidCardMapping(), { wrapper });

    await waitFor(() => {
      expect(result.current.rfidCardMapping).toEqual(mapping);
    });
  });

  it("api.notifications.onDeckUpdated を購読する", async () => {
    renderHook(() => useRfidCardMapping(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onDeckUpdated).toHaveBeenCalledTimes(1);
    });
  });

  it("deck_updated イベントを受信するとマッピングが更新される", async () => {
    const initialMapping = makeMapping({ id: "deck-1" });
    vi.mocked(api.rfid.getMapping).mockResolvedValue(initialMapping);

    let capturedCb: ((mapping: RfidCardMapping) => void) | undefined;
    vi.mocked(api.notifications.onDeckUpdated).mockImplementation(
      async (cb) => {
        capturedCb = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useRfidCardMapping(), { wrapper });

    await waitFor(() => {
      expect(result.current.rfidCardMapping).toEqual(initialMapping);
    });

    const updatedMapping = makeMapping({ id: "deck-2", name: "Updated Deck" });
    act(() => {
      capturedCb?.(updatedMapping);
    });

    await waitFor(() => {
      expect(result.current.rfidCardMapping).toEqual(updatedMapping);
    });
  });

  it("アンマウント時に unlisten が呼ばれる", async () => {
    const unsubscribe = vi.fn();
    vi.mocked(api.notifications.onDeckUpdated).mockResolvedValue(unsubscribe);

    const { unmount } = renderHook(() => useRfidCardMapping(), { wrapper });

    await waitFor(() => {
      expect(api.notifications.onDeckUpdated).toHaveBeenCalledTimes(1);
    });

    unmount();

    await waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it("useRfidCardMapping はデフォルト値 { rfidCardMapping: null } を返す", () => {
    // Provider なしでも動作する（デフォルト値が設定されているため）
    const { result } = renderHook(() => useRfidCardMapping());
    expect(result.current.rfidCardMapping).toBeNull();
  });
});
