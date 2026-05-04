import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncedNavigate } from "./useSyncedNavigate";

// react-router の useNavigate をモック
const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("useSyncedNavigate", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("navigate を呼び出すと useNavigate が発火する", () => {
    const { result } = renderHook(() => useSyncedNavigate(), { wrapper });

    result.current("/game/playing");

    expect(mockNavigate).toHaveBeenCalledWith("/game/playing", undefined);
  });

  it("state オプションを渡すと navigate の第2引数に含まれる", () => {
    const { result } = renderHook(() => useSyncedNavigate(), { wrapper });

    result.current("/game/playing", { state: { foo: "bar" } });

    expect(mockNavigate).toHaveBeenCalledWith("/game/playing", {
      state: { foo: "bar" },
    });
  });

  it("skipSync=true の場合もローカルナビゲーションは実行される", () => {
    const { result } = renderHook(() => useSyncedNavigate(), { wrapper });

    result.current("/game/playing", { skipSync: true });

    expect(mockNavigate).toHaveBeenCalledWith("/game/playing", undefined);
  });

  it("skipSync=false（省略）の場合もローカルナビゲーションは実行される", () => {
    const { result } = renderHook(() => useSyncedNavigate(), { wrapper });

    result.current("/home", { skipSync: false });

    expect(mockNavigate).toHaveBeenCalledWith("/home", undefined);
  });

  it("複数回呼び出すと複数回 navigate が発火する", () => {
    const { result } = renderHook(() => useSyncedNavigate(), { wrapper });

    result.current("/home");
    result.current("/game/playing");

    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });
});
