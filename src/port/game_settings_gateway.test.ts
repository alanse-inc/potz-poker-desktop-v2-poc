import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultGameSettings } from "../domain/table_name";
import type { PersistedGameSettings } from "./game_settings_gateway";
import { TauriGameSettingsGateway } from "./game_settings_gateway";

const makeInMemoryStore = () => {
  const data: Map<string, unknown> = new Map();
  return {
    get: vi.fn(async (key: string) => data.get(key) ?? undefined),
    set: vi.fn(async (key: string, value: unknown) => {
      data.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      data.delete(key);
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

describe("TauriGameSettingsGateway", () => {
  let gateway: TauriGameSettingsGateway;

  beforeEach(() => {
    storeInstance = makeInMemoryStore();
    gateway = new TauriGameSettingsGateway();
  });

  describe("get()", () => {
    it("ストアにデータがない場合は null を返す", async () => {
      const result = await gateway.get();
      expect.soft(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect.soft(result.value).toBeNull();
      }
    });

    it("ストアに保存されたデータを返す", async () => {
      const settings = createDefaultGameSettings();
      storeInstance._data.set("gameSettings", settings);

      const result = await gateway.get();
      expect.soft(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect.soft(result.value).toEqual(settings);
      }
    });

    it("store.get が throw した場合は err を返す", async () => {
      storeInstance.get.mockRejectedValueOnce(new Error("store error"));
      const result = await gateway.get();
      expect.soft(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect.soft(result.error.message).toBe("store error");
      }
    });
  });

  describe("save()", () => {
    it("設定を保存して ok を返す", async () => {
      const settings: PersistedGameSettings = {
        ...createDefaultGameSettings(),
        currentMode: "auto",
      };

      const result = await gateway.save(settings);
      expect.soft(result.isOk()).toBe(true);
      expect
        .soft(storeInstance.set)
        .toHaveBeenCalledWith("gameSettings", settings);
      expect.soft(storeInstance.save).toHaveBeenCalled();
    });

    it("保存した設定を get で取得できる", async () => {
      const settings = createDefaultGameSettings();
      await gateway.save(settings);

      storeInstance.get.mockResolvedValueOnce(settings);
      const result = await gateway.get();
      expect.soft(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect.soft(result.value).toEqual(settings);
      }
    });

    it("store.set が throw した場合は err を返す", async () => {
      storeInstance.set.mockRejectedValueOnce(new Error("write error"));
      const result = await gateway.save(createDefaultGameSettings());
      expect.soft(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect.soft(result.error.message).toBe("write error");
      }
    });

    it("store.save が throw した場合は err を返す", async () => {
      storeInstance.save.mockRejectedValueOnce(new Error("flush error"));
      const result = await gateway.save(createDefaultGameSettings());
      expect.soft(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect.soft(result.error.message).toBe("flush error");
      }
    });
  });

  describe("clear()", () => {
    it("保存されたデータを削除して ok を返す", async () => {
      storeInstance._data.set("gameSettings", createDefaultGameSettings());

      const result = await gateway.clear();
      expect.soft(result.isOk()).toBe(true);
      expect.soft(storeInstance.delete).toHaveBeenCalledWith("gameSettings");
      expect.soft(storeInstance.save).toHaveBeenCalled();
    });

    it("データがない状態で clear() を呼んでも ok を返す", async () => {
      const result = await gateway.clear();
      expect.soft(result.isOk()).toBe(true);
    });

    it("store.delete が throw した場合は err を返す", async () => {
      storeInstance.delete.mockRejectedValueOnce(new Error("delete error"));
      const result = await gateway.clear();
      expect.soft(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect.soft(result.error.message).toBe("delete error");
      }
    });
  });

  describe("manualMode / autoMode の設定を正しく保存・取得する", () => {
    it("manualMode のプレイヤーとブラインド設定を保存・取得できる", async () => {
      const settings: PersistedGameSettings = {
        ...createDefaultGameSettings(),
        manualMode: {
          players: [
            {
              id: "player-1",
              name: "Alice",
              icon: null,
              status: "active",
              stack: 10000,
              seat: 1,
              position: "btn",
            },
          ],
          settings: {
            name: "Test Tournament",
            miniChip: 100,
            smallBlind: 500,
            bigBlind: 1000,
            anteRule: "none",
            blindExceptionRule: "dead_button",
          },
          btnPlayerId: "player-1",
        },
      };

      await gateway.save(settings);
      storeInstance.get.mockResolvedValueOnce(settings);

      const result = await gateway.get();
      expect.soft(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect.soft(result.value?.manualMode.players).toHaveLength(1);
        expect.soft(result.value?.manualMode.players[0].name).toBe("Alice");
        expect.soft(result.value?.manualMode.settings.bigBlind).toBe(1000);
      }
    });

    it("telopSettings を保存・取得できる", async () => {
      const settings: PersistedGameSettings = {
        ...createDefaultGameSettings(),
        telopSettings: {
          telopId: "broadcast",
          backgroundColor: "#FF0000",
        },
      };

      await gateway.save(settings);
      storeInstance.get.mockResolvedValueOnce(settings);

      const result = await gateway.get();
      expect.soft(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect.soft(result.value?.telopSettings.telopId).toBe("broadcast");
        expect
          .soft(result.value?.telopSettings.backgroundColor)
          .toBe("#FF0000");
      }
    });
  });
});
