/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "./usePreferences";

const makeInMemoryStore = () => {
  const data: Map<string, unknown> = new Map();
  return {
    get: vi.fn(async (key: string) => data.get(key) ?? undefined),
    set: vi.fn(async (key: string, value: unknown) => {
      data.set(key, value);
    }),
    save: vi.fn(async () => {}),
    _data: data,
  };
};

let storeInstance: ReturnType<typeof makeInMemoryStore>;

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(async () => storeInstance),
  },
}));

import { usePreferences } from "./usePreferences";

describe("usePreferences", () => {
  beforeEach(() => {
    storeInstance = makeInMemoryStore();
    vi.clearAllMocks();
  });

  describe("初期読み込み", () => {
    it("ストアが空の場合は DEFAULT_PREFERENCES を返し isLoaded が true になる", async () => {
      const { result } = renderHook(() => usePreferences());

      expect.soft(result.current.isLoaded).toBe(false);

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect.soft(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    });

    it("ストアに保存されたデータを読み込む", async () => {
      const stored = {
        lastSelectedSessionId: "session-abc",
        lastSelectedDeckIds: ["deck-1", "deck-2"],
      };
      storeInstance._data.set("preferences", stored);

      const { result } = renderHook(() => usePreferences());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect.soft(result.current.preferences).toEqual(stored);
    });

    it("lastSelectedSessionId が null の場合も正しく読み込む", async () => {
      const stored = {
        lastSelectedSessionId: null,
        lastSelectedDeckIds: ["deck-1"],
      };
      storeInstance._data.set("preferences", stored);

      const { result } = renderHook(() => usePreferences());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect.soft(result.current.preferences.lastSelectedSessionId).toBeNull();
      expect
        .soft(result.current.preferences.lastSelectedDeckIds)
        .toEqual(["deck-1"]);
    });

    it("ストアの読み込みが失敗しても isLoaded が true になりデフォルト値を返す", async () => {
      storeInstance.get.mockRejectedValueOnce(new Error("store read error"));

      const { result } = renderHook(() => usePreferences());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect.soft(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    });
  });

  describe("savePreferences", () => {
    it("部分更新 (lastSelectedSessionId のみ) が store に保存される", async () => {
      const { result } = renderHook(() => usePreferences());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.savePreferences({
          lastSelectedSessionId: "session-xyz",
        });
      });

      expect
        .soft(result.current.preferences.lastSelectedSessionId)
        .toBe("session-xyz");
      expect.soft(result.current.preferences.lastSelectedDeckIds).toEqual([]);
      expect.soft(storeInstance.set).toHaveBeenCalledWith("preferences", {
        lastSelectedSessionId: "session-xyz",
        lastSelectedDeckIds: [],
      });
      expect.soft(storeInstance.save).toHaveBeenCalled();
    });

    it("部分更新 (lastSelectedDeckIds のみ) が store に保存される", async () => {
      const { result } = renderHook(() => usePreferences());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.savePreferences({
          lastSelectedDeckIds: ["deck-a", "deck-b"],
        });
      });

      expect.soft(result.current.preferences.lastSelectedSessionId).toBeNull();
      expect
        .soft(result.current.preferences.lastSelectedDeckIds)
        .toEqual(["deck-a", "deck-b"]);
    });

    it("lastSelectedDeckIds を空配列で保存できる", async () => {
      storeInstance._data.set("preferences", {
        lastSelectedSessionId: "session-1",
        lastSelectedDeckIds: ["deck-1"],
      });

      const { result } = renderHook(() => usePreferences());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.savePreferences({ lastSelectedDeckIds: [] });
      });

      expect.soft(result.current.preferences.lastSelectedDeckIds).toEqual([]);
    });

    it("store への保存が失敗しても state は更新される", async () => {
      const { result } = renderHook(() => usePreferences());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      storeInstance.set.mockRejectedValueOnce(new Error("write error"));

      await act(async () => {
        await result.current.savePreferences({
          lastSelectedSessionId: "session-xyz",
        });
      });

      // state は楽観的更新されている
      expect
        .soft(result.current.preferences.lastSelectedSessionId)
        .toBe("session-xyz");
    });
  });

  describe("DEFAULT_PREFERENCES", () => {
    it("lastSelectedSessionId は null", () => {
      expect(DEFAULT_PREFERENCES.lastSelectedSessionId).toBeNull();
    });

    it("lastSelectedDeckIds は空配列", () => {
      expect(DEFAULT_PREFERENCES.lastSelectedDeckIds).toEqual([]);
    });
  });
});
