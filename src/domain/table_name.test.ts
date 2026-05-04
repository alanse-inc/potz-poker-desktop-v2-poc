import { describe, expect, it } from "vitest";
import type { PersistedGameSettings } from "./table_name";
import { TableNameSync } from "./table_name";

describe("TableNameSync", () => {
  const createDefaultSettings = (): PersistedGameSettings => ({
    currentMode: "manual",
    manualMode: {
      players: [],
      settings: {
        name: "Original Tournament",
        miniChip: 100,
        smallBlind: 500,
        bigBlind: 1000,
        anteRule: "none",
        blindExceptionRule: "dead_button",
      },
      btnPlayerId: null,
    },
    autoMode: {
      players: [],
      settings: {
        name: "Original Tournament",
      },
      btnPlayerId: null,
    },
    telopSettings: {
      telopId: "basic",
      backgroundColor: "#00FF00",
    },
  });

  describe("syncTableName", () => {
    it("両モードにテーブル名を同期する", () => {
      const settings = createDefaultSettings();
      const result = TableNameSync.syncTableName(
        settings,
        "New Tournament Name",
      );

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.manualMode.settings.name).toEqual(
        "New Tournament Name",
      );
      expect(updatedSettings.autoMode.settings.name).toEqual(
        "New Tournament Name",
      );
    });

    it("他の設定値は変更されない", () => {
      const settings = createDefaultSettings();
      const result = TableNameSync.syncTableName(settings, "New Tournament");

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.manualMode.settings.miniChip).toEqual(100);
      expect(updatedSettings.manualMode.settings.smallBlind).toEqual(500);
      expect(updatedSettings.manualMode.settings.bigBlind).toEqual(1000);
      expect(updatedSettings.manualMode.settings.anteRule).toEqual("none");
      expect(updatedSettings.manualMode.settings.blindExceptionRule).toEqual(
        "dead_button",
      );
      expect(updatedSettings.telopSettings.telopId).toEqual("basic");
    });

    it("プレイヤー情報は変更されない", () => {
      const settings = createDefaultSettings();
      settings.manualMode.players = [
        {
          id: "player1",
          name: "Player 1",
          icon: null,
          status: "active",
          stack: 10000,
          seat: 1,
          position: "btn",
        },
      ];
      settings.autoMode.players = [
        {
          id: "player1",
          name: "Player 1",
          icon: null,
          seat: 1,
          position: "btn",
        },
      ];

      const result = TableNameSync.syncTableName(settings, "Updated Name");

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.manualMode.players).toEqual(
        settings.manualMode.players,
      );
      expect(updatedSettings.autoMode.players).toEqual(
        settings.autoMode.players,
      );
    });

    it("空文字も許容する", () => {
      const settings = createDefaultSettings();
      const result = TableNameSync.syncTableName(settings, "");

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.manualMode.settings.name).toEqual("");
      expect(updatedSettings.autoMode.settings.name).toEqual("");
    });
  });

  describe("updateManualModeSetting", () => {
    it("Manual Modeのみの設定を更新する（miniChip）", () => {
      const settings = createDefaultSettings();
      const result = TableNameSync.updateManualModeSetting(
        settings,
        "miniChip",
        200,
      );

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.manualMode.settings.miniChip).toEqual(200);
    });

    it("Manual Modeのみの設定を更新する（smallBlind）", () => {
      const settings = createDefaultSettings();
      const result = TableNameSync.updateManualModeSetting(
        settings,
        "smallBlind",
        1000,
      );

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.manualMode.settings.smallBlind).toEqual(1000);
    });

    it("Manual Modeのみの設定を更新する（bigBlind）", () => {
      const settings = createDefaultSettings();
      const result = TableNameSync.updateManualModeSetting(
        settings,
        "bigBlind",
        2000,
      );

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.manualMode.settings.bigBlind).toEqual(2000);
    });

    it("Manual Modeのみの設定を更新する（anteRule）", () => {
      const settings = createDefaultSettings();
      const result = TableNameSync.updateManualModeSetting(
        settings,
        "anteRule",
        "bbante",
      );

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.manualMode.settings.anteRule).toEqual("bbante");
    });

    it("Manual Modeのみの設定を更新する（blindExceptionRule）", () => {
      const settings = createDefaultSettings();
      const result = TableNameSync.updateManualModeSetting(
        settings,
        "blindExceptionRule",
        "moving_forward",
      );

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.manualMode.settings.blindExceptionRule).toEqual(
        "moving_forward",
      );
    });

    it("Auto Modeの設定は変更されない", () => {
      const settings = createDefaultSettings();
      settings.autoMode.settings.name = "Auto Mode Tournament";

      const result = TableNameSync.updateManualModeSetting(
        settings,
        "smallBlind",
        999,
      );

      if (result.isErr()) {
        throw result.error;
      }

      const updatedSettings = result._unsafeUnwrap();
      expect(updatedSettings.autoMode.settings.name).toEqual(
        "Auto Mode Tournament",
      );
    });
  });
});
