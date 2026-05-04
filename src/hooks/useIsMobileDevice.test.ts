import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobileDevice } from "./useIsMobileDevice";

describe("useIsMobileDevice", () => {
  const originalUserAgent = navigator.userAgent;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: originalMaxTouchPoints,
      configurable: true,
    });
  });

  const setUserAgent = (ua: string) => {
    Object.defineProperty(navigator, "userAgent", {
      value: ua,
      configurable: true,
    });
  };

  const setMaxTouchPoints = (n: number) => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: n,
      configurable: true,
    });
  };

  describe("モバイルデバイス判定", () => {
    it("iPhone UA の場合は true を返す", () => {
      setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      );
      const { result } = renderHook(() => useIsMobileDevice());
      expect(result.current).toBe(true);
    });

    it("Android UA の場合は true を返す", () => {
      setUserAgent(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36",
      );
      const { result } = renderHook(() => useIsMobileDevice());
      expect(result.current).toBe(true);
    });

    it("iPad UA（iPadOS 12 以前）の場合は true を返す", () => {
      setUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15",
      );
      const { result } = renderHook(() => useIsMobileDevice());
      expect(result.current).toBe(true);
    });

    it("iPadOS 13+ は Macintosh UA + maxTouchPoints > 0 で true を返す", () => {
      setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
      );
      setMaxTouchPoints(5);
      const { result } = renderHook(() => useIsMobileDevice());
      expect(result.current).toBe(true);
    });

    it("デスクトップ Mac（maxTouchPoints=0）は false を返す", () => {
      setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
      );
      setMaxTouchPoints(0);
      const { result } = renderHook(() => useIsMobileDevice());
      expect(result.current).toBe(false);
    });

    it("Windows デスクトップ UA は false を返す", () => {
      setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
      );
      setMaxTouchPoints(0);
      const { result } = renderHook(() => useIsMobileDevice());
      expect(result.current).toBe(false);
    });
  });
});
