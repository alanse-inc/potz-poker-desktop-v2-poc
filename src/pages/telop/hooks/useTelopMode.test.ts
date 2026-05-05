import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import type { TelopState } from "../../../types";
import { useTelopMode } from "./useTelopMode";

vi.mock("../../../api/client", () => ({
  api: {
    telop: {
      getState: vi.fn(),
    },
    notifications: {
      onTelopUpdated: vi.fn(),
    },
  },
}));

describe("useTelopMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.telop.getState).mockResolvedValue({
      message: "",
      color: "#000000",
      mode: "modern",
    } as TelopState);
    vi.mocked(api.notifications.onTelopUpdated).mockResolvedValue(() => {});
  });

  it("初期値は 'basic'", () => {
    const { result } = renderHook(() => useTelopMode());
    expect(result.current).toBe("basic");
  });

  it("getState の mode が反映される", async () => {
    vi.mocked(api.telop.getState).mockResolvedValue({
      message: "",
      color: "#000000",
      mode: "modern",
    } as TelopState);

    const { result } = renderHook(() => useTelopMode());

    await waitFor(() => {
      expect(result.current).toBe("modern");
    });
  });

  it("telop_updated イベントの mode 変化に反応する", async () => {
    let capturedCb: ((state: TelopState) => void) | undefined;
    vi.mocked(api.notifications.onTelopUpdated).mockImplementation(
      async (cb) => {
        capturedCb = cb;
        return () => {};
      },
    );
    vi.mocked(api.telop.getState).mockResolvedValue({
      message: "",
      color: "#000000",
      mode: "modern",
    } as TelopState);

    const { result } = renderHook(() => useTelopMode());

    await waitFor(() => {
      expect(api.notifications.onTelopUpdated).toHaveBeenCalledTimes(1);
    });

    act(() => {
      capturedCb?.({ message: "", color: "#000000", mode: "classic" });
    });

    await waitFor(() => {
      expect(result.current).toBe("classic");
    });
  });

  it("telop_updated イベントの mode が broadcast に変化する", async () => {
    let capturedCb: ((state: TelopState) => void) | undefined;
    vi.mocked(api.notifications.onTelopUpdated).mockImplementation(
      async (cb) => {
        capturedCb = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useTelopMode());

    await waitFor(() => {
      expect(api.notifications.onTelopUpdated).toHaveBeenCalledTimes(1);
    });

    act(() => {
      capturedCb?.({ message: "", color: "#000000", mode: "broadcast" });
    });

    await waitFor(() => {
      expect(result.current).toBe("broadcast");
    });
  });

  it("mode がない場合は現在の値を維持する", async () => {
    let capturedCb: ((state: TelopState) => void) | undefined;
    vi.mocked(api.notifications.onTelopUpdated).mockImplementation(
      async (cb) => {
        capturedCb = cb;
        return () => {};
      },
    );
    vi.mocked(api.telop.getState).mockResolvedValue({
      message: "",
      color: "#000000",
      mode: "modern",
    } as TelopState);

    const { result } = renderHook(() => useTelopMode());

    await waitFor(() => {
      expect(result.current).toBe("modern");
    });

    act(() => {
      // mode フィールドなし
      capturedCb?.({ message: "updated", color: "#ffffff" } as TelopState);
    });

    // mode がないので modern のままであること
    await waitFor(() => {
      expect(result.current).toBe("modern");
    });
  });

  it("アンマウント時に unlisten が呼ばれる", async () => {
    const unlisten = vi.fn();
    vi.mocked(api.notifications.onTelopUpdated).mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => useTelopMode());

    await waitFor(() => {
      expect(api.notifications.onTelopUpdated).toHaveBeenCalledTimes(1);
    });

    unmount();

    await waitFor(() => {
      expect(unlisten).toHaveBeenCalledTimes(1);
    });
  });
});
