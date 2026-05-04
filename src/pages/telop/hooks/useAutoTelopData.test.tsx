import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { AutoBoardProvider } from "../../../contexts/auto_board_context";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../../domain/auto_game/types";
import { useAutoTelopData } from "./useAutoTelopData";

const wrapper = ({ children }: { children: ReactNode }) => (
  <AutoBoardProvider>{children}</AutoBoardProvider>
);

function makePlayer(overrides: Partial<AutoModePlayer> = {}): AutoModePlayer {
  return {
    id: "p1",
    name: "Alice",
    icon: null,
    seat: 1,
    position: "btn",
    action: null,
    hand: [
      { suit: "spade", value: "A" },
      { suit: "heart", value: "K" },
    ],
    odds: 0.5,
    ...overrides,
  };
}

function makeBoard(players: AutoModePlayer[]): AutoModeBoard {
  return {
    setting: { name: "Test Game" },
    players,
    communityCards: [],
    burnCards: [],
    handNumber: 1,
    winners: null,
  };
}

describe("useAutoTelopData (no board → mock data)", () => {
  it("board が null のときはモックデータを返す", () => {
    // localStorage を空にしてから AutoBoardProvider を使う
    localStorage.clear();
    const { result } = renderHook(() => useAutoTelopData(), { wrapper });
    // モックデータは 9 プレイヤー全員が hand を持つ
    expect(result.current.players.length).toBeGreaterThan(0);
    expect(result.current.board.setting.name).toBeTruthy();
  });

  it("board が null のときの players は hand>=2 のみ", () => {
    localStorage.clear();
    const { result } = renderHook(() => useAutoTelopData(), { wrapper });
    for (const player of result.current.players) {
      expect(player.hand.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("useAutoTelopData (with board from localStorage)", () => {
  it("フォールドプレイヤーはフィルタされる", () => {
    const players: AutoModePlayer[] = [
      makePlayer({ id: "p1", action: null }),
      makePlayer({ id: "p2", action: "fold" }),
    ];
    const board = makeBoard(players);
    localStorage.setItem("auto_mode_board", JSON.stringify(board));

    const { result } = renderHook(() => useAutoTelopData(), { wrapper });

    const ids = result.current.players.map((p) => p.id);
    expect(ids).toContain("p1");
    expect(ids).not.toContain("p2");

    localStorage.clear();
  });

  it("hand が 2 枚未満のプレイヤーはフィルタされる", () => {
    const players: AutoModePlayer[] = [
      makePlayer({
        id: "p1",
        hand: [
          { suit: "spade", value: "A" },
          { suit: "heart", value: "K" },
        ],
      }),
      makePlayer({ id: "p2", hand: [{ suit: "spade", value: "A" }] }),
      makePlayer({ id: "p3", hand: [] }),
    ];
    const board = makeBoard(players);
    localStorage.setItem("auto_mode_board", JSON.stringify(board));

    const { result } = renderHook(() => useAutoTelopData(), { wrapper });

    const ids = result.current.players.map((p) => p.id);
    expect(ids).toContain("p1");
    expect(ids).not.toContain("p2");
    expect(ids).not.toContain("p3");

    localStorage.clear();
  });

  it("board が存在するときは board.setting を返す", () => {
    const players = [makePlayer()];
    const board = makeBoard(players);
    board.setting = { name: "My Custom Game" };
    localStorage.setItem("auto_mode_board", JSON.stringify(board));

    const { result } = renderHook(() => useAutoTelopData(), { wrapper });
    expect(result.current.board.setting.name).toBe("My Custom Game");

    localStorage.clear();
  });
});
