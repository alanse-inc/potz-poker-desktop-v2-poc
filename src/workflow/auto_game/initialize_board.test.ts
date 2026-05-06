/**
 * Auto Game ボード初期化ワークフローのテスト
 */

import { describe, expect, it } from "vitest";
import type { AutoModePlayer } from "../../domain/auto_game/types";
import { initializeBoard } from "./initialize_board";

type PlayerInput = Pick<AutoModePlayer, "id" | "name" | "icon" | "seat"> & {
  position?: AutoModePlayer["position"];
};

function makePlayerInput(
  overrides: Partial<PlayerInput> & { id: string; seat: number },
): PlayerInput {
  return {
    name: "Player",
    icon: null,
    position: null,
    ...overrides,
  };
}

const setting = { name: "TEST GAME" };

describe("initializeBoard", () => {
  it("正常なプレイヤー一覧でボードを初期化できる", () => {
    const result = initializeBoard({
      setting,
      players: [
        makePlayerInput({ id: "p1", seat: 1, position: "btn" }),
        makePlayerInput({ id: "p2", seat: 2, position: "bb" }),
      ],
      handNumber: 1,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const board = result.value;
      expect(board.setting.name).toBe("TEST GAME");
      expect(board.players).toHaveLength(2);
      expect(board.handNumber).toBe(1);
      expect(board.communityCards).toEqual([]);
      expect(board.burnCards).toEqual([]);
      expect(board.winners).toBeNull();
    }
  });

  it("3人以上のプレイヤーでポジションが正しく割り当てられる", () => {
    const result = initializeBoard({
      setting,
      players: [
        makePlayerInput({ id: "p1", seat: 1, position: "btn" }),
        makePlayerInput({ id: "p2", seat: 2, position: "sb" }),
        makePlayerInput({ id: "p3", seat: 3, position: "bb" }),
      ],
      handNumber: 1,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const btnPlayer = result.value.players.find(
        (p) => p.position === "btn" || p.position === "btn_sb",
      );
      expect(btnPlayer?.id).toBe("p1");
    }
  });

  it("btnPlayerId を明示的に指定できる", () => {
    const result = initializeBoard({
      setting,
      players: [
        makePlayerInput({ id: "p1", seat: 1 }),
        makePlayerInput({ id: "p2", seat: 2 }),
      ],
      btnPlayerId: "p2",
      handNumber: 1,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const btnPlayer = result.value.players.find(
        (p) => p.position === "btn" || p.position === "btn_sb",
      );
      expect(btnPlayer?.id).toBe("p2");
    }
  });

  it("プレイヤーが 1 人の場合は insufficient_players エラー", () => {
    const result = initializeBoard({
      setting,
      players: [makePlayerInput({ id: "p1", seat: 1, position: "btn" })],
      handNumber: 1,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe("insufficient_players");
    }
  });

  it("プレイヤーが 0 人の場合は insufficient_players エラー", () => {
    const result = initializeBoard({
      setting,
      players: [],
      handNumber: 1,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe("insufficient_players");
    }
  });

  it("BTN プレイヤーが特定できない場合は no_btn_player エラー", () => {
    const result = initializeBoard({
      setting,
      players: [
        makePlayerInput({ id: "p1", seat: 1, position: null }),
        makePlayerInput({ id: "p2", seat: 2, position: null }),
      ],
      handNumber: 1,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe("no_btn_player");
    }
  });

  it("handNumber が結果に反映される", () => {
    const result = initializeBoard({
      setting,
      players: [
        makePlayerInput({ id: "p1", seat: 1, position: "btn" }),
        makePlayerInput({ id: "p2", seat: 2, position: "bb" }),
      ],
      handNumber: 7,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.handNumber).toBe(7);
    }
  });

  it("初期化後のプレイヤーはアクション・手札・Odds がリセットされる", () => {
    const result = initializeBoard({
      setting,
      players: [
        makePlayerInput({ id: "p1", seat: 1, position: "btn" }),
        makePlayerInput({ id: "p2", seat: 2, position: "bb" }),
      ],
      handNumber: 1,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      for (const player of result.value.players) {
        expect(player.action).toBeNull();
        expect(player.hand).toEqual([]);
        expect(player.odds).toBeNull();
      }
    }
  });
});
