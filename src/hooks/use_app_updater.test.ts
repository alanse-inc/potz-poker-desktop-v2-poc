/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

import { check } from "@tauri-apps/plugin-updater";
import { useAppUpdater } from "./use_app_updater";

const mockCheck = vi.mocked(check);

describe("useAppUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // DEV フラグを false に設定して updater を有効にする
    vi.stubEnv("DEV", false);
    // デフォルトは更新なし
    mockCheck.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("初期状態は idle", () => {
    const { result } = renderHook(() => useAppUpdater());
    expect(result.current.state.phase).toBe("idle");
  });

  it("check() が null を返す場合、状態は idle のまま", async () => {
    mockCheck.mockResolvedValue(null);

    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.phase).toBe("idle");
  });

  it("unmount 後に check() が解決しても setState が呼ばれない", async () => {
    let resolveCheck!: (value: { available: boolean; version: string }) => void;
    const checkPromise = new Promise<{ available: boolean; version: string }>(
      (resolve) => {
        resolveCheck = resolve;
      },
    );
    mockCheck.mockReturnValue(checkPromise as ReturnType<typeof check>);

    const { result, unmount } = renderHook(() => useAppUpdater());

    // check() は pending 中
    unmount();

    // unmount 後に check() を解決
    await act(async () => {
      resolveCheck({ available: true, version: "2.0.0" });
      await Promise.resolve();
      await Promise.resolve();
    });

    // unmount 後なので available に遷移しないこと
    expect(result.current.state.phase).toBe("idle");
  });

  it("dismiss() を呼ぶと状態が idle に戻る", async () => {
    mockCheck.mockResolvedValue({
      available: true,
      version: "2.0.0",
      downloadAndInstall: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof check>>);

    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.state.phase).toBe("idle");
  });
});
