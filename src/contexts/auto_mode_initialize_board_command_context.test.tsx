import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedGameSettings } from "../domain/table_name";
import type {
  AutoModeInitializeBoardCommand,
  PlayerSeatRange,
} from "./auto_mode_initialize_board_command_context";
import {
  AutoModeInitializeBoardCommandProvider,
  useAutoModeInitializeBoardCommand,
} from "./auto_mode_initialize_board_command_context";

// useSSEConnection のモック（Tauri イベントリスナーは不要）
vi.mock("../hooks/useSSEConnection", () => ({
  useSSEConnection: vi.fn(),
}));

// モックのセットアップ
beforeEach(() => {
  vi.clearAllMocks();

  // apiFetchのモック（HTTP API通信）
  global.fetch = vi
    .fn()
    .mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/api/game-settings")) {
        // POSTリクエスト（保存）の場合
        if (options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: "success",
                value: null,
              }),
          });
        }
        // GETリクエスト（取得）の場合 - デフォルトでは保存データなし
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              type: "success",
              value: null,
            }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      });
    });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <AutoModeInitializeBoardCommandProvider>
    {children}
  </AutoModeInitializeBoardCommandProvider>
);

// テスト用のプレイヤーデータ生成ヘルパー
const createAutoModePlayer = (
  id: string,
  name: string,
  seat: PlayerSeatRange,
  position: AutoModeInitializeBoardCommand["input"]["players"][number]["position"] = null,
  iconStr?: string,
): AutoModeInitializeBoardCommand["input"]["players"][number] => {
  return {
    id,
    name,
    seat,
    position,
    icon: iconStr && iconStr.length > 0 ? iconStr : undefined,
  };
};

describe("AutoModeInitializeBoardCommandProvider", () => {
  describe("初期化", () => {
    it("保存データがない場合は空のプレイヤーリストで初期化される", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      expect(result.current.initializeBoardCommand.input.players).toEqual([]);
      expect(result.current.initializeBoardCommand.input.setting.mode).toBe(
        "auto",
      );
    });

    it("保存されたプレイヤー情報を復元する", async () => {
      // 保存データをモック (予約済みゲスト ID で hex16 形式)
      const savedPlayers = [
        {
          id: "0000000000000000",
          name: "Player 1",
          icon: "🎮",
          seat: 1,
          position: "btn",
        },
        {
          id: "0000000000000001",
          name: "Player 2",
          icon: "🎯",
          seat: 2,
          position: "sb",
        },
        {
          id: "0000000000000002",
          name: "Player 3",
          icon: null,
          seat: 3,
          position: "bb",
        },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/game-settings")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: "success",
                value: {
                  autoMode: {
                    players: savedPlayers,
                    settings: {
                      name: "Test Tournament",
                    },
                  },
                },
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand.input.players.length).toBe(
          3,
        );
      });

      const players = result.current.initializeBoardCommand.input.players;
      expect(players[0]?.id).toBe("0000000000000000");
      expect(players[0]?.name).toBe("Player 1");
      expect(players[0]?.seat).toBe(1);
      expect(players[0]?.position).toBe("btn");
      expect(players[0]?.icon).toBeDefined();

      expect(players[1]?.id).toBe("0000000000000001");
      expect(players[1]?.seat).toBe(2);
      expect(players[1]?.position).toBe("sb");

      expect(players[2]?.id).toBe("0000000000000002");
      expect(players[2]?.seat).toBe(3);
      expect(players[2]?.position).toBe("bb");
      expect(players[2]?.icon).toBeUndefined(); // アイコンなし

      expect(result.current.initializeBoardCommand.input.setting.name).toBe(
        "Test Tournament",
      );
    });

    it("PlayerIconが空文字列の場合はundefinedとして復元される", async () => {
      const savedPlayers = [
        {
          id: "0000000000000000",
          name: "Player 1",
          icon: "", // 空文字列は不正
          seat: 1,
          position: null,
        },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/game-settings")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: "success",
                value: {
                  autoMode: {
                    players: savedPlayers,
                    settings: { name: "" },
                  },
                },
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand.input.players.length).toBe(
          1,
        );
      });

      const player = result.current.initializeBoardCommand.input.players[0];
      expect(player?.icon).toBeUndefined(); // 空文字列はundefined
    });
  });

  describe("updatePlayer", () => {
    it("新規プレイヤーを追加できる", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      const newPlayer = createAutoModePlayer("player1", "Player 1", 1);

      await act(async () => {
        await result.current.updatePlayer(newPlayer);
      });

      expect(result.current.initializeBoardCommand.input.players).toEqual([
        newPlayer,
      ]);
    });

    it("既存プレイヤーの情報を更新できる", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      const player1 = createAutoModePlayer("player1", "Player 1", 1);
      await act(async () => {
        await result.current.updatePlayer(player1);
      });

      const updatedPlayer1 = createAutoModePlayer(
        "UpdatedPlayer1",
        "Updated Player 1",
        1,
        null,
        "🎮",
      );
      await act(async () => {
        await result.current.updatePlayer(updatedPlayer1);
      });

      expect(result.current.initializeBoardCommand.input.players).toEqual([
        updatedPlayer1,
      ]);
    });

    it("新規プレイヤーが追加されると、既存の全プレイヤーのポジションがリセットされる", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      const player1 = createAutoModePlayer("player1", "Player 1", 1, "btn");
      const player2 = createAutoModePlayer("player2", "Player 2", 2, "sb");
      await act(async () => {
        await result.current.updatePlayer(player1);
      });
      await act(async () => {
        await result.current.updatePlayer(player2);
      });

      // 新規プレイヤーを追加
      const player3 = createAutoModePlayer("player3", "Player 3", 3);
      await act(async () => {
        await result.current.updatePlayer(player3);
      });

      const expectedPlayers = [
        { ...player1, position: null }, // player1 のポジションがリセット
        { ...player2, position: null }, // player2 のポジションがリセット
        player3, // 新規プレイヤー
      ];
      expect(result.current.initializeBoardCommand.input.players).toEqual(
        expectedPlayers,
      );
    });
  });

  describe("deletePlayer", () => {
    it("プレイヤーを削除すると、残りの全プレイヤーのポジションがリセットされる", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      const player1 = createAutoModePlayer("player1", "Player 1", 1, "btn");
      const player2 = createAutoModePlayer("player2", "Player 2", 2, "sb");
      const player3 = createAutoModePlayer("player3", "Player 3", 3, "bb");
      await act(async () => {
        await result.current.updatePlayer(player1);
      });
      await act(async () => {
        await result.current.updatePlayer(player2);
      });
      await act(async () => {
        await result.current.updatePlayer(player3);
      });

      // player2 を削除
      act(() => {
        result.current.deletePlayer("player2");
      });

      const expectedPlayers = [
        { ...player1, position: null }, // player1 のポジションがリセット
        { ...player3, position: null }, // player3 のポジションがリセット
      ];
      expect(result.current.initializeBoardCommand.input.players).toEqual(
        expectedPlayers,
      );
    });
  });

  describe("setBtnPosition", () => {
    it("BTN位置を設定すると全ポジションが自動割り当てされる（3人以上）", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      const player1 = createAutoModePlayer("player1", "Player 1", 1);
      const player2 = createAutoModePlayer("player2", "Player 2", 2);
      const player3 = createAutoModePlayer("player3", "Player 3", 3);
      await act(async () => {
        await result.current.updatePlayer(player1);
      });
      await act(async () => {
        await result.current.updatePlayer(player2);
      });
      await act(async () => {
        await result.current.updatePlayer(player3);
      });

      // seat 2 にBTNを設定
      act(() => {
        result.current.setBtnPosition(2);
      });

      const players = result.current.initializeBoardCommand.input.players;
      const btnPlayer = players.find((p) => p.seat === 2);
      const sbPlayer = players.find((p) => p.position === "sb");
      const bbPlayer = players.find((p) => p.position === "bb");

      expect(btnPlayer?.position).toBe("btn");
      expect(sbPlayer).toBeDefined();
      expect(bbPlayer).toBeDefined();
    });

    it("BTN位置を設定すると全ポジションが自動割り当てされる（ヘッズアップ）", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      const player1 = createAutoModePlayer("player1", "Player 1", 1);
      const player2 = createAutoModePlayer("player2", "Player 2", 2);
      await act(async () => {
        await result.current.updatePlayer(player1);
      });
      await act(async () => {
        await result.current.updatePlayer(player2);
      });

      // seat 1 にBTNを設定
      act(() => {
        result.current.setBtnPosition(1);
      });

      const players = result.current.initializeBoardCommand.input.players;
      const btnPlayer = players.find((p) => p.seat === 1);
      const bbPlayer = players.find((p) => p.position === "bb");

      expect(btnPlayer?.position).toBe("btn_sb"); // ヘッズアップなのでbtn_sb
      expect(bbPlayer).toBeDefined();
    });
  });

  describe("isStartable", () => {
    it("プレイヤーが2人以上でBTNが設定されていればゲーム開始可能", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      const player1 = createAutoModePlayer("player1", "Player 1", 1);
      const player2 = createAutoModePlayer("player2", "Player 2", 2);
      await act(async () => {
        await result.current.updatePlayer(player1);
      });
      await act(async () => {
        await result.current.updatePlayer(player2);
      });

      // BTNを設定
      act(() => {
        result.current.setBtnPosition(1);
      });

      expect(result.current.isStartable).toBe(true);
    });

    it("プレイヤーが1人以下の場合はゲーム開始不可", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      const player1 = createAutoModePlayer("player1", "Player 1", 1, "btn");
      await act(async () => {
        await result.current.updatePlayer(player1);
      });

      expect(result.current.isStartable).toBe(false);
    });

    it("BTNが設定されていない場合はゲーム開始不可", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      const player1 = createAutoModePlayer("player1", "Player 1", 1);
      const player2 = createAutoModePlayer("player2", "Player 2", 2);
      await act(async () => {
        await result.current.updatePlayer(player1);
      });
      await act(async () => {
        await result.current.updatePlayer(player2);
      });

      expect(result.current.isStartable).toBe(false);
    });
  });

  describe("updateInitializeBoardSetting", () => {
    it("トーナメント名を更新できる", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      act(() => {
        result.current.updateInitializeBoardSetting("name", "Test Tournament");
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand.input.setting.name).toBe(
          "Test Tournament",
        );
      });
    });

    it("トーナメント名を更新するとManualMode設定にも同期される", async () => {
      // 既存の設定をモック
      const existingSettings: PersistedGameSettings = {
        currentMode: "auto",
        autoMode: {
          players: [],
          settings: { name: "" },
          btnPlayerId: null,
        },
        manualMode: {
          players: [],
          settings: {
            name: "",
            miniChip: 100,
            smallBlind: 500,
            bigBlind: 1000,
            anteRule: "none",
            blindExceptionRule: "dead_button",
          },
          btnPlayerId: null,
        },
        telopSettings: {
          telopId: "basic",
          backgroundColor: "#00FF00",
        },
      };

      let savedSettings: PersistedGameSettings | null = null;

      global.fetch = vi
        .fn()
        .mockImplementation((url: string, options?: RequestInit) => {
          if (url.includes("/api/game-settings")) {
            if (options?.method === "POST") {
              // 保存されたデータをキャプチャ
              savedSettings = JSON.parse(options.body as string);
              return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ type: "success", value: null }),
              });
            }
            // GET: 既存の設定を返す
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({ type: "success", value: existingSettings }),
            });
          }
          return Promise.resolve({ ok: false, status: 404 });
        });

      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      // トーナメント名を更新
      await act(async () => {
        await result.current.updateInitializeBoardSetting(
          "name",
          "Shared Tournament Name",
        );
      });

      // 保存されたデータにAutoModeとManualMode両方のnameが含まれていることを確認
      await waitFor(() => {
        expect(savedSettings).not.toBeNull();
        if (savedSettings) {
          expect(savedSettings.autoMode.settings.name).toBe(
            "Shared Tournament Name",
          );
          expect(savedSettings.manualMode.settings.name).toBe(
            "Shared Tournament Name",
          );
        }
      });
    });
  });

  describe("SSEイベント処理", () => {
    it("SSEイベントハンドリング構造が存在する", async () => {
      const { result } = renderHook(() => useAutoModeInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      // Note: SSEイベントの実際のシミュレーションは
      // useSSEConnectionのモックが必要なため、ここではコンテキストが
      // 正しく初期化され、イベント処理の基盤が整っていることを確認するのみ
      expect(result.current.initializeBoardCommand).toBeDefined();
      expect(result.current.updatePlayer).toBeDefined();
      expect(result.current.setBtnPosition).toBeDefined();
    });
  });
});
