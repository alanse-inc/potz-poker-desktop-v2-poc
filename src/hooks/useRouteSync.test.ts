import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRouteSync } from "./useRouteSync";

describe("useRouteSync", () => {
  it("フックが例外なくマウントできる", () => {
    expect(() => {
      renderHook(() => useRouteSync());
    }).not.toThrow();
  });

  it("戻り値は undefined（no-op）", () => {
    const { result } = renderHook(() => useRouteSync());
    expect(result.current).toBeUndefined();
  });

  it("アンマウント時も例外が発生しない", () => {
    const { unmount } = renderHook(() => useRouteSync());
    expect(() => unmount()).not.toThrow();
  });
});
