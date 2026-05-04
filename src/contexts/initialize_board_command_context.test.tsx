/**
 * initialize_board_command_context.test.tsx
 *
 * Electron 版 (1219 行) を Tauri 2 向けに移植。
 *
 * 変換点:
 *   - window.board / window.initializeCommand / window.gameSettings を削除
 *     (Tauri 版では HTTP API + Tauri コマンド経由のため不要)
 *   - "@tauri-apps/api/core" と "@tauri-apps/api/event" は vitest.config の
 *     globalSetup (src/test/setup.ts) でモック済み
 *   - fetch のモックは各テストで global.fetch をモック
 *   - PlayerStatus / PlayerSeatRange は本 context から import
 *   - NewPlayerIcon / ManualModeInitializeBoardCommand は本 context から import
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InitializeBoardCommandProvider,
  type ManualModeInitializeBoardCommand,
  type ManualPlayerStatus,
  NewPlayerIcon,
  type PlayerSeatRange,
  useInitializeBoardCommand,
} from "./initialize_board_command_context";

// @tauri-apps/api/core と @tauri-apps/api/event は setup.ts でグローバルモック済み
// (invoke → null, listen → () => {})

// fetch のデフォルトモック（保存データなし）
beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/game-settings")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ type: "success", value: null }),
      });
    }
    if (typeof url === "string" && url.includes("/api/board")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ type: "success", value: null }),
      });
    }
    if (typeof url === "string" && url.includes("/api/initial-board/player")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ type: "success" }),
      });
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    });
  });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <InitializeBoardCommandProvider>{children}</InitializeBoardCommandProvider>
);

// テスト用のプレイヤーデータ生成ヘルパー
const createPlayer = (
  id: string,
  name: string,
  seat: PlayerSeatRange,
  status: ManualPlayerStatus = "active",
  stack = 1000,
  position: ManualModeInitializeBoardCommand["input"]["players"][number]["position"] = null,
): ManualModeInitializeBoardCommand["input"]["players"][number] => ({
  id,
  name,
  seat,
  status,
  stack,
  position,
});

describe("InitializeBoardCommandProvider", () => {
  describe("updatePlayer", () => {
    it("新規プレイヤーを追加できる", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });
      const newPlayer = createPlayer("playerId1", "player1", 1);

      act(() => {
        result.current.updatePlayer(newPlayer);
      });

      expect(result.current.initializeBoardCommand.input.players).toEqual([
        newPlayer,
      ]);
    });

    it("既存プレイヤーの情報を更新できる", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });
      const player1 = createPlayer("playerId1", "player1", 1);
      act(() => {
        result.current.updatePlayer(player1);
      });

      const updatedPlayer1 = {
        ...player1,
        id: "NewPlayer1",
        stack: 2000,
        status: "active" as ManualPlayerStatus,
      };
      act(() => {
        result.current.updatePlayer(updatedPlayer1);
      });

      expect(result.current.initializeBoardCommand.input.players).toEqual([
        updatedPlayer1,
      ]);
    });

    it("プレイヤーを 'leaved' に更新すると、自身と他のプレイヤーのポジションがリセットされる", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });
      const player1 = createPlayer(
        "playerId1",
        "player1",
        1,
        "active",
        1000,
        "btn",
      );
      const player2 = createPlayer(
        "playerId2",
        "player2",
        2,
        "active",
        1000,
        "sb",
      );
      const player3 = createPlayer(
        "playerId3",
        "player3",
        3,
        "active",
        1000,
        "bb",
      );
      act(() => result.current.updatePlayer(player1));
      act(() => result.current.updatePlayer(player2));
      act(() => result.current.updatePlayer(player3));

      const leavedPlayer2 = {
        ...player2,
        status: "leaved" as ManualPlayerStatus,
      };
      act(() => {
        result.current.updatePlayer(leavedPlayer2);
      });

      const expectedPlayers = [
        { ...player1, position: null },
        { ...leavedPlayer2, position: null },
        { ...player3, position: null },
      ];
      expect(result.current.initializeBoardCommand.input.players).toEqual(
        expectedPlayers,
      );
    });

    it("既存プレイヤーを 'active' に更新すると、全プレイヤーのポジションがリセットされる", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });
      const player1 = createPlayer(
        "player1",
        "player1",
        1,
        "active",
        1000,
        "btn",
      );
      const player2 = createPlayer(
        "player2",
        "player2",
        2,
        "leaved",
        1000,
        null,
      );
      const player3 = createPlayer(
        "player3",
        "player3",
        3,
        "active",
        1000,
        "bb",
      );
      act(() => result.current.updatePlayer(player1));
      act(() => result.current.updatePlayer(player2));
      act(() => result.current.updatePlayer(player3));

      const activePlayer2 = {
        ...player2,
        status: "active" as ManualPlayerStatus,
      };
      act(() => {
        result.current.updatePlayer(activePlayer2);
      });

      const expectedPlayers = [
        { ...player1, position: null },
        { ...activePlayer2, position: null },
        { ...player3, position: null },
      ];
      expect(result.current.initializeBoardCommand.input.players).toEqual(
        expectedPlayers,
      );
    });

    it("新規プレイヤーが追加されると、既存の全プレイヤーのポジションがリセットされる", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });
      const player1 = createPlayer(
        "player1",
        "player1",
        1,
        "active",
        1000,
        "btn",
      );
      const player2 = createPlayer(
        "player2",
        "player2",
        2,
        "active",
        1000,
        "sb",
      );
      act(() => result.current.updatePlayer(player1));
      act(() => result.current.updatePlayer(player2));

      const player3 = createPlayer("3", "player3", 3, "active", 1000, "bb");
      act(() => {
        result.current.updatePlayer(player3);
      });

      const expectedPlayers = [
        { ...player1, position: null },
        { ...player2, position: null },
        player3,
      ];
      expect(result.current.initializeBoardCommand.input.players).toEqual(
        expectedPlayers,
      );
    });

    it("3人以上いる状態でプレイヤーを 'btn' に更新すると、他のポジションがリセットされ、SB/BBが自動設定される", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });
      const player1 = createPlayer("playerId1", "player1", 1);
      const player2 = createPlayer("playerId2", "player2", 2);
      const player3 = createPlayer("playerId3", "player3", 3);
      const player4 = createPlayer("playerId4", "player4", 4, "leaved");
      act(() => result.current.updatePlayer(player1));
      act(() => result.current.updatePlayer(player2));
      act(() => result.current.updatePlayer(player3));
      act(() => result.current.updatePlayer(player4));

      const btnPlayer2 = {
        ...player2,
        position:
          "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
      };
      act(() => {
        result.current.updatePlayer(btnPlayer2);
      });

      const expectedPlayers = [
        { ...player1, position: "bb" },
        { ...btnPlayer2, position: "btn" },
        { ...player3, position: "sb" },
        { ...player4, position: null },
      ];
      expect(
        [...result.current.initializeBoardCommand.input.players].sort(
          (a, b) => a.seat - b.seat,
        ),
      ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
    });

    it("ヘッズアップ状態でプレイヤーを 'btn' に更新すると、自身が 'btn_sb'、相手が 'bb' になる", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });
      const player1 = createPlayer("playerId1", "player1", 1);
      const player2 = createPlayer("playerId2", "player2", 2);
      act(() => result.current.updatePlayer(player1));
      act(() => result.current.updatePlayer(player2));

      const btnPlayer1 = {
        ...player1,
        position:
          "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
      };
      act(() => {
        result.current.updatePlayer(btnPlayer1);
      });

      const expectedPlayers = [
        { ...btnPlayer1, position: "btn_sb" },
        { ...player2, position: "bb" },
      ];
      expect(
        [...result.current.initializeBoardCommand.input.players].sort(
          (a, b) => a.seat - b.seat,
        ),
      ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
    });

    it("'leaved' 状態のプレイヤーに 'btn' を設定しようとしてもポジションは null のまま", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });
      const player1 = createPlayer("playerId1", "player1", 1, "leaved");
      act(() => result.current.updatePlayer(player1));

      const btnPlayer1 = {
        ...player1,
        position:
          "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
      };
      act(() => {
        result.current.updatePlayer(btnPlayer1);
      });

      expect(result.current.initializeBoardCommand.input.players).toEqual([
        { ...player1, position: null },
      ]);
    });

    describe("dead_button処理", () => {
      it("bustプレイヤーにBTNを設定すると、次のアクティブプレイヤーからSB/BBが設定される（3人）", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        const player1 = createPlayer("playerId1", "player1", 1);
        const player2 = createPlayer("playerId2", "player2", 2, "bust", 0);
        const player3 = createPlayer("playerId3", "player3", 3);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));

        const btnPlayer2 = {
          ...player2,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer2);
        });

        const expectedPlayers = [
          { ...player1, position: "bb" },
          { ...btnPlayer2, position: "btn" },
          { ...player3, position: "sb" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("bustプレイヤーにBTNを設定すると、次のアクティブプレイヤーからSB/BBが設定される（アクティブ2人）", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        const player1 = createPlayer("playerId1", "player1", 1);
        const player2 = createPlayer("playerId2", "player2", 2, "bust", 0);
        const player3 = createPlayer("playerId3", "player3", 3);
        const player4 = createPlayer("playerId4", "player4", 4, "leaved");
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));
        act(() => result.current.updatePlayer(player4));

        const btnPlayer2 = {
          ...player2,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer2);
        });

        const expectedPlayers = [
          { ...player1, position: "bb" },
          { ...btnPlayer2, position: "btn" },
          { ...player3, position: "sb" },
          { ...player4, position: null },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("bustプレイヤーにBTNを設定（5人テーブル）で正しくポジションが割り当てられる", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        const player1 = createPlayer("playerId1", "player1", 1);
        const player2 = createPlayer("playerId2", "player2", 2, "bust", 0);
        const player3 = createPlayer("playerId3", "player3", 3);
        const player4 = createPlayer("playerId4", "player4", 4);
        const player5 = createPlayer("playerId5", "player5", 5);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));
        act(() => result.current.updatePlayer(player4));
        act(() => result.current.updatePlayer(player5));

        const btnPlayer2 = {
          ...player2,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer2);
        });

        const expectedPlayers = [
          { ...player1, position: "co" },
          { ...btnPlayer2, position: "btn" },
          { ...player3, position: "sb" },
          { ...player4, position: "bb" },
          { ...player5, position: "utg" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("最後の席のbustプレイヤーにBTNを設定すると、ラップアラウンドして最初のプレイヤーがSBになる", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        const player1 = createPlayer("playerId1", "player1", 1);
        const player2 = createPlayer("playerId2", "player2", 2);
        const player3 = createPlayer("playerId3", "player3", 3, "bust", 0);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));

        const btnPlayer3 = {
          ...player3,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer3);
        });

        const expectedPlayers = [
          { ...player1, position: "sb" },
          { ...player2, position: "bb" },
          { ...btnPlayer3, position: "btn" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });
    });

    describe("one_big処理（初回ゲーム開始時）", () => {
      it("bustの右隣にBTNを設定すると、SBがスキップされる", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        act(() => {
          result.current.updateInitializeBoardSetting(
            "blindExceptionRule",
            "dead_button",
          );
        });

        const player1 = createPlayer("playerId1", "player1", 1);
        const player2 = createPlayer("playerId2", "player2", 2, "bust", 0);
        const player3 = createPlayer("playerId3", "player3", 3);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));

        const btnPlayer1 = {
          ...player1,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer1);
        });

        const expectedPlayers = [
          { ...btnPlayer1, position: "btn" },
          { ...player2, position: null },
          { ...player3, position: "bb" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("複数のbustプレイヤーがいて、最後のbustの右隣にBTNを設定した場合", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        act(() => {
          result.current.updateInitializeBoardSetting(
            "blindExceptionRule",
            "dead_button",
          );
        });

        const player1 = createPlayer("playerId1", "player1", 1, "bust", 0);
        const player2 = createPlayer("playerId2", "player2", 2);
        const player3 = createPlayer("playerId3", "player3", 3, "bust", 0);
        const player4 = createPlayer("playerId4", "player4", 4);
        const player5 = createPlayer("playerId5", "player5", 5);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));
        act(() => result.current.updatePlayer(player4));
        act(() => result.current.updatePlayer(player5));

        const btnPlayer2 = {
          ...player2,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer2);
        });

        const expectedPlayers = [
          { ...player1, position: null },
          { ...btnPlayer2, position: "btn" },
          { ...player3, position: null },
          { ...player4, position: "bb" },
          { ...player5, position: "co" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("座席番号が飛んでいる場合のone_big適用", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        act(() => {
          result.current.updateInitializeBoardSetting(
            "blindExceptionRule",
            "dead_button",
          );
        });

        const player1 = createPlayer("playerId1", "player1", 1);
        const player3 = createPlayer("playerId3", "player3", 3, "bust", 0);
        const player7 = createPlayer("playerId7", "player7", 7);
        const player9 = createPlayer("playerId9", "player9", 9);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player3));
        act(() => result.current.updatePlayer(player7));
        act(() => result.current.updatePlayer(player9));

        const btnPlayer1 = {
          ...player1,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer1);
        });

        const expectedPlayers = [
          { ...btnPlayer1, position: "btn" },
          { ...player3, position: null },
          { ...player7, position: "bb" },
          { ...player9, position: "co" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("bustプレイヤーが連続している場合もone_bigが適用される", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        act(() => {
          result.current.updateInitializeBoardSetting(
            "blindExceptionRule",
            "dead_button",
          );
        });

        const player1 = createPlayer("playerId1", "player1", 1);
        const player2 = createPlayer("playerId2", "player2", 2, "bust", 0);
        const player3 = createPlayer("playerId3", "player3", 3, "bust", 0);
        const player4 = createPlayer("playerId4", "player4", 4);
        const player5 = createPlayer("playerId5", "player5", 5);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));
        act(() => result.current.updatePlayer(player4));
        act(() => result.current.updatePlayer(player5));

        const btnPlayer1 = {
          ...player1,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer1);
        });

        const expectedPlayers = [
          { ...btnPlayer1, position: "btn" },
          { ...player2, position: null },
          { ...player3, position: null },
          { ...player4, position: "bb" },
          { ...player5, position: "co" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("ヘッズアップ相当（2人アクティブ）の場合はone_bigが適用されない", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        act(() => {
          result.current.updateInitializeBoardSetting(
            "blindExceptionRule",
            "dead_button",
          );
        });

        const player1 = createPlayer("playerId1", "player1", 1);
        const player2 = createPlayer("playerId2", "player2", 2, "bust", 0);
        const player3 = createPlayer("playerId3", "player3", 3);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));

        const btnPlayer3 = {
          ...player3,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer3);
        });

        const expectedPlayers = [
          { ...player1, position: "bb" },
          { ...player2, position: null },
          { ...btnPlayer3, position: "btn_sb" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("moving_forwardルールの場合はone_bigが適用されない", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        act(() => {
          result.current.updateInitializeBoardSetting(
            "blindExceptionRule",
            "moving_forward",
          );
        });

        const player1 = createPlayer("playerId1", "player1", 1);
        const player2 = createPlayer("playerId2", "player2", 2, "bust", 0);
        const player3 = createPlayer("playerId3", "player3", 3);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));

        const btnPlayer3 = {
          ...player3,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer3);
        });

        const expectedPlayers = [
          { ...player1, position: "bb" },
          { ...player2, position: null },
          { ...btnPlayer3, position: "btn_sb" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("bustプレイヤーがBTNの前にいない場合はone_bigが適用されない", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        act(() => {
          result.current.updateInitializeBoardSetting(
            "blindExceptionRule",
            "dead_button",
          );
        });

        const player1 = createPlayer("playerId1", "player1", 1, "bust", 0);
        const player2 = createPlayer("playerId2", "player2", 2);
        const player3 = createPlayer("playerId3", "player3", 3);
        const player4 = createPlayer("playerId4", "player4", 4);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));
        act(() => result.current.updatePlayer(player4));

        const btnPlayer3 = {
          ...player3,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer3);
        });

        const expectedPlayers = [
          { ...player1, position: null },
          { ...player2, position: "bb" },
          { ...btnPlayer3, position: "btn" },
          { ...player4, position: "sb" },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("seat1の前（seat9）にbustがいる場合のラップアラウンドでone_big適用", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        act(() => {
          result.current.updateInitializeBoardSetting(
            "blindExceptionRule",
            "dead_button",
          );
        });

        const player1 = createPlayer("playerId1", "player1", 1);
        const player2 = createPlayer("playerId2", "player2", 2);
        const player9 = createPlayer("playerId9", "player9", 9, "bust", 0);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player9));

        const btnPlayer1 = {
          ...player1,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer1);
        });

        // ヘッズアップなのでone_bigは適用されない（2人アクティブ）
        const expectedPlayers = [
          { ...btnPlayer1, position: "btn_sb" },
          { ...player2, position: "bb" },
          { ...player9, position: null },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });

      it("全員がbustプレイヤーの場合、BTNはそのまま設定される", () => {
        const { result } = renderHook(() => useInitializeBoardCommand(), {
          wrapper,
        });
        act(() => {
          result.current.updateInitializeBoardSetting(
            "blindExceptionRule",
            "dead_button",
          );
        });

        const player1 = createPlayer("playerId1", "player1", 1, "bust", 0);
        const player2 = createPlayer("playerId2", "player2", 2, "bust", 0);
        const player3 = createPlayer("playerId3", "player3", 3, "bust", 0);
        act(() => result.current.updatePlayer(player1));
        act(() => result.current.updatePlayer(player2));
        act(() => result.current.updatePlayer(player3));

        const btnPlayer1 = {
          ...player1,
          position:
            "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
        };
        act(() => {
          result.current.updatePlayer(btnPlayer1);
        });

        const expectedPlayers = [
          { ...btnPlayer1, position: "btn" },
          { ...player2, position: null },
          { ...player3, position: null },
        ];
        expect(
          [...result.current.initializeBoardCommand.input.players].sort(
            (a, b) => a.seat - b.seat,
          ),
        ).toEqual(expectedPlayers.sort((a, b) => a.seat - b.seat));
      });
    });
  });

  describe("isStartable", () => {
    it("bustプレイヤーがBTNでも、アクティブプレイヤーにSB/BBが設定されていればゲーム開始可能", async () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      act(() => {
        result.current.updateInitializeBoardSetting("smallBlind", 50);
      });
      act(() => {
        result.current.updateInitializeBoardSetting("bigBlind", 100);
      });
      act(() => {
        result.current.updateInitializeBoardSetting("miniChip", 25);
      });

      await waitFor(() => {
        expect(
          result.current.initializeBoardCommand.input.setting.smallBlind,
        ).toBe(50);
        expect(
          result.current.initializeBoardCommand.input.setting.bigBlind,
        ).toBe(100);
        expect(
          result.current.initializeBoardCommand.input.setting.miniChip,
        ).toBe(25);
      });

      const player1 = createPlayer("playerId1", "player1", 1, "active", 1000);
      const player2 = createPlayer("playerId2", "player2", 2, "bust", 0);
      const player3 = createPlayer("playerId3", "player3", 3, "active", 1000);

      act(() => result.current.updatePlayer(player1));
      act(() => result.current.updatePlayer(player2));
      act(() => result.current.updatePlayer(player3));

      const btnPlayer2 = {
        ...player2,
        position:
          "btn" as ManualModeInitializeBoardCommand["input"]["players"][number]["position"],
      };
      act(() => {
        result.current.updatePlayer(btnPlayer2);
      });

      expect(result.current.isStartable).toBe(true);
    });

    it("SB/BBが設定されていない場合はゲーム開始不可", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });

      act(() => {
        result.current.updateInitializeBoardSetting("smallBlind", 50);
      });
      act(() => {
        result.current.updateInitializeBoardSetting("bigBlind", 100);
      });
      act(() => {
        result.current.updateInitializeBoardSetting("miniChip", 25);
      });

      const player1 = createPlayer("playerId1", "player1", 1, "active", 1000);
      const player2 = createPlayer("playerId2", "player2", 2, "bust", 0, "btn");
      const player3 = createPlayer("playerId3", "player3", 3, "active", 1000);

      act(() => result.current.updatePlayer(player1));
      act(() => result.current.updatePlayer(player2));
      act(() => result.current.updatePlayer(player3));

      expect(result.current.isStartable).toBe(false);
    });

    it("one big適用時はSBがいなくてもゲーム開始可能", async () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      act(() => {
        result.current.updateInitializeBoardSetting("smallBlind", 50);
      });
      act(() => {
        result.current.updateInitializeBoardSetting("bigBlind", 100);
      });
      act(() => {
        result.current.updateInitializeBoardSetting("miniChip", 25);
      });

      await waitFor(() => {
        expect(
          result.current.initializeBoardCommand.input.setting.smallBlind,
        ).toBe(50);
        expect(
          result.current.initializeBoardCommand.input.setting.bigBlind,
        ).toBe(100);
        expect(
          result.current.initializeBoardCommand.input.setting.miniChip,
        ).toBe(25);
      });

      const bustPlayer = {
        id: "1",
        name: "Bust Player",
        icon: NewPlayerIcon("🎮").value,
        seat: 1 as PlayerSeatRange,
        stack: 1000,
        status: "bust" as const,
        position: null,
      };
      const btnPlayer = {
        id: "2",
        name: "BTN Player",
        icon: NewPlayerIcon("🎮").value,
        seat: 9 as PlayerSeatRange,
        stack: 1000,
        status: "active" as const,
        position: "btn" as const,
      };
      const bbPlayer = {
        id: "3",
        name: "BB Player",
        icon: NewPlayerIcon("🎮").value,
        seat: 2 as PlayerSeatRange,
        stack: 1000,
        status: "active" as const,
        position: null,
      };

      act(() => result.current.updatePlayer(bustPlayer));
      act(() => result.current.updatePlayer(bbPlayer));
      act(() => result.current.updatePlayer(btnPlayer));

      const players = result.current.initializeBoardCommand.input.players;
      const hasSb = players.some((p) => p.position === "sb");
      const hasBb = players.some((p) => p.position === "bb");
      const hasBtn = players.some((p) => p.position === "btn");

      expect(hasSb).toBe(false);
      expect(hasBb).toBe(true);
      expect(hasBtn).toBe(true);

      expect(result.current.isStartable).toBe(true);
    });
  });

  describe("deletePlayer", () => {
    it("プレイヤーを削除すると、残りの全プレイヤーのポジションがリセットされる", () => {
      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });
      const player1 = createPlayer(
        "player1",
        "player1",
        1,
        "active",
        1000,
        "btn",
      );
      const player2 = createPlayer(
        "player2",
        "player2",
        2,
        "active",
        1000,
        "sb",
      );
      const player3 = createPlayer(
        "player3",
        "player3",
        3,
        "active",
        1000,
        "bb",
      );
      act(() => result.current.updatePlayer(player1));
      act(() => result.current.updatePlayer(player2));
      act(() => result.current.updatePlayer(player3));

      act(() => {
        result.current.deletePlayer("player2");
      });

      const expectedPlayers = [
        { ...player1, position: null },
        { ...player3, position: null },
      ];
      expect(result.current.initializeBoardCommand.input.players).toEqual(
        expectedPlayers,
      );
    });
  });

  describe("updateInitializeBoardSetting - テーブル名の同期", () => {
    it("トーナメント名を更新するとAutoMode設定にも同期される", async () => {
      const existingSettings = {
        currentMode: "manual",
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

      let savedSettings: typeof existingSettings | null = null;

      global.fetch = vi
        .fn()
        .mockImplementation((url: string, options?: RequestInit) => {
          if (url.includes("/api/game-settings")) {
            if (options?.method === "POST") {
              savedSettings = JSON.parse(options.body as string);
              return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ type: "success", value: null }),
              });
            }
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({ type: "success", value: existingSettings }),
            });
          }
          if (url.includes("/api/board")) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ type: "success", value: null }),
            });
          }
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({}),
          });
        });

      const { result } = renderHook(() => useInitializeBoardCommand(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.initializeBoardCommand).toBeDefined();
      });

      await act(async () => {
        result.current.updateInitializeBoardSetting(
          "name",
          "Shared Tournament Name",
        );
      });

      await waitFor(() => {
        expect(savedSettings).not.toBeNull();
        if (savedSettings) {
          expect(
            (savedSettings as typeof existingSettings).manualMode.settings.name,
          ).toBe("Shared Tournament Name");
          expect(
            (savedSettings as typeof existingSettings).autoMode.settings.name,
          ).toBe("Shared Tournament Name");
        }
      });
    });
  });
});
