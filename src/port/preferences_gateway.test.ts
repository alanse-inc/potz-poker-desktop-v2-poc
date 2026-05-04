import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Preferences } from "./preferences_gateway";
import {
  DEFAULT_PREFERENCES,
  TauriPreferencesGateway,
} from "./preferences_gateway";

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

describe("TauriPreferencesGateway", () => {
  let gateway: TauriPreferencesGateway;

  beforeEach(() => {
    storeInstance = makeInMemoryStore();
    gateway = new TauriPreferencesGateway();
  });

  describe("get()", () => {
    it("ストアにデータがない場合は DEFAULT_PREFERENCES を返す", async () => {
      const result = await gateway.get();
      expect.soft(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect.soft(result.value).toEqual(DEFAULT_PREFERENCES);
      }
    });

    it("ストアに保存されたデータを返す", async () => {
      const prefs: Preferences = {
        lastSelectedSessionId: "session-abc",
        lastSelectedDeckIds: ["deck-1", "deck-2"],
      };
      storeInstance._data.set("preferences", prefs);

      const result = await gateway.get();
      expect.soft(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect.soft(result.value).toEqual(prefs);
      }
    });

    it("lastSelectedSessionId が null の preferences を返す", async () => {
      const prefs: Preferences = {
        lastSelectedSessionId: null,
        lastSelectedDeckIds: ["deck-1"],
      };
      storeInstance._data.set("preferences", prefs);

      const result = await gateway.get();
      expect.soft(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect.soft(result.value.lastSelectedSessionId).toBeNull();
        expect.soft(result.value.lastSelectedDeckIds).toEqual(["deck-1"]);
      }
    });

    it("store.get が throw した場合は err を返す", async () => {
      storeInstance.get.mockRejectedValueOnce(new Error("store read error"));
      const result = await gateway.get();
      expect.soft(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect.soft(result.error.message).toBe("store read error");
      }
    });
  });

  describe("save()", () => {
    it("preferences を保存して ok を返す", async () => {
      const prefs: Preferences = {
        lastSelectedSessionId: "session-xyz",
        lastSelectedDeckIds: ["deck-a"],
      };

      const result = await gateway.save(prefs);
      expect.soft(result.isOk()).toBe(true);
      expect.soft(storeInstance.set).toHaveBeenCalledWith("preferences", prefs);
      expect.soft(storeInstance.save).toHaveBeenCalled();
    });

    it("保存した preferences を get で取得できる", async () => {
      const prefs: Preferences = {
        lastSelectedSessionId: "session-xyz",
        lastSelectedDeckIds: [],
      };
      await gateway.save(prefs);
      storeInstance.get.mockResolvedValueOnce(prefs);

      const result = await gateway.get();
      expect.soft(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect.soft(result.value).toEqual(prefs);
      }
    });

    it("lastSelectedDeckIds が空配列でも保存できる", async () => {
      const prefs: Preferences = {
        lastSelectedSessionId: null,
        lastSelectedDeckIds: [],
      };

      const result = await gateway.save(prefs);
      expect.soft(result.isOk()).toBe(true);
    });

    it("store.set が throw した場合は err を返す", async () => {
      storeInstance.set.mockRejectedValueOnce(new Error("write error"));
      const result = await gateway.save(DEFAULT_PREFERENCES);
      expect.soft(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect.soft(result.error.message).toBe("write error");
      }
    });

    it("store.save が throw した場合は err を返す", async () => {
      storeInstance.save.mockRejectedValueOnce(new Error("flush error"));
      const result = await gateway.save(DEFAULT_PREFERENCES);
      expect.soft(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect.soft(result.error.message).toBe("flush error");
      }
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
