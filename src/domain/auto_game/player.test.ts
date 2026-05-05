/**
 * Auto Game プレイヤードメインロジックのテスト
 */

import { describe, expect, it } from "vitest";
import {
  assignPositions,
  determineNextButtonPlayerId,
  foldPlayer,
  initializePlayer,
  initializePlayers,
  isActive,
  sortPlayers,
} from "./player";
import type { AutoModePlayer } from "./types";

function makePlayer(
  overrides: Partial<AutoModePlayer> & { id: string; seat: number },
): AutoModePlayer {
  return {
    name: "Player",
    icon: null,
    position: null,
    action: null,
    hand: [],
    odds: null,
    ...overrides,
  };
}

describe("sortPlayers", () => {
  it("シート番号の昇順にソートする", () => {
    const players = [
      makePlayer({ id: "p3", seat: 3 }),
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2 }),
    ];
    const sorted = sortPlayers(players);
    expect(sorted.map((p) => p.seat)).toEqual([1, 2, 3]);
  });
});

describe("foldPlayer", () => {
  it("プレイヤーを fold 状態にする", () => {
    const player = makePlayer({ id: "p1", seat: 1 });
    const folded = foldPlayer(player);
    expect(folded.action).toBe("fold");
  });
});

describe("isActive", () => {
  it("fold していないプレイヤーは active", () => {
    const player = makePlayer({ id: "p1", seat: 1, action: null });
    expect(isActive(player)).toBe(true);
  });

  it("fold したプレイヤーは active でない", () => {
    const player = makePlayer({ id: "p1", seat: 1, action: "fold" });
    expect(isActive(player)).toBe(false);
  });
});

describe("initializePlayer", () => {
  it("プレイヤーを初期状態にする", () => {
    const initialized = initializePlayer({
      id: "p1",
      name: "Alice",
      icon: null,
      seat: 1,
    });
    expect(initialized.hand).toEqual([]);
    expect(initialized.action).toBeNull();
    expect(initialized.position).toBeNull();
    expect(initialized.odds).toBeNull();
  });
});

describe("initializePlayers", () => {
  it("複数プレイヤーを初期化する", () => {
    const players = initializePlayers([
      { id: "p1", name: "Alice", icon: null, seat: 1 },
      { id: "p2", name: "Bob", icon: null, seat: 2 },
    ]);
    expect(players).toHaveLength(2);
    for (const p of players) {
      expect(p.hand).toEqual([]);
      expect(p.action).toBeNull();
    }
  });
});

describe("assignPositions", () => {
  it("2人の場合 btn_sb + bb を割り当てる", () => {
    const players = [
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2 }),
    ];
    const result = assignPositions(players, "p1");
    const p1 = result.find((p) => p.id === "p1");
    const p2 = result.find((p) => p.id === "p2");
    expect(p1?.position).toBe("btn_sb");
    expect(p2?.position).toBe("bb");
  });

  it("3人の場合 btn + sb + bb を割り当てる", () => {
    const players = [
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2 }),
      makePlayer({ id: "p3", seat: 3 }),
    ];
    const result = assignPositions(players, "p1");
    const positions = result.map((p) => p.position);
    expect(positions).toContain("btn");
    expect(positions).toContain("sb");
    expect(positions).toContain("bb");
  });

  it("BTN プレイヤーが存在しない場合は変更なし", () => {
    const players = [
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2 }),
    ];
    const result = assignPositions(players, "nonexistent");
    // btnIndex が -1 → 変更なし
    expect(result.map((p) => p.position)).toEqual([null, null]);
  });

  it("9人の場合 co が含まれ utg_plus_3 が含まれない", () => {
    const players = Array.from({ length: 9 }, (_, i) =>
      makePlayer({ id: `p${i + 1}`, seat: i + 1 }),
    );
    const result = assignPositions(players, "p1");
    const positions = result.map((p) => p.position);
    expect(positions).toContain("co");
    expect(positions).not.toContain("utg_plus_3");
  });

  it("8人の場合 hj まで割り当てられ co は含まれない", () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makePlayer({ id: `p${i + 1}`, seat: i + 1 }),
    );
    const result = assignPositions(players, "p1");
    const positions = result.map((p) => p.position);
    expect(positions).toContain("hj");
    expect(positions).not.toContain("co");
  });

  it("9人の場合ポジション順が正しい", () => {
    const players = Array.from({ length: 9 }, (_, i) =>
      makePlayer({ id: `p${i + 1}`, seat: i + 1 }),
    );
    // p1 が BTN
    const result = assignPositions(players, "p1");
    const positions = result.map((p) => p.position);
    expect(positions).toEqual([
      "btn",
      "sb",
      "bb",
      "utg",
      "utg_plus_1",
      "utg_plus_2",
      "mp",
      "hj",
      "co",
    ]);
  });
});

describe("determineNextButtonPlayerId", () => {
  it("前の BTN の次のプレイヤーが新しい BTN になる", () => {
    const previousPlayers = [
      makePlayer({ id: "p1", seat: 1, position: "btn" }),
      makePlayer({ id: "p2", seat: 2, position: "sb" }),
      makePlayer({ id: "p3", seat: 3, position: "bb" }),
    ];
    const currentPlayers = [
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2 }),
      makePlayer({ id: "p3", seat: 3 }),
    ];
    const nextBtnId = determineNextButtonPlayerId(
      previousPlayers,
      currentPlayers,
    );
    expect(nextBtnId).toBe("p2");
  });

  it("前の BTN が見つからない場合は先頭プレイヤーを返す", () => {
    const previousPlayers: AutoModePlayer[] = [];
    const currentPlayers = [
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2 }),
    ];
    const nextBtnId = determineNextButtonPlayerId(
      previousPlayers,
      currentPlayers,
    );
    expect(nextBtnId).toBe("p1");
  });
});
