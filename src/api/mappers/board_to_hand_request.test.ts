import { describe, expect, test, vi } from "vitest";

vi.mock("../../features/error_tracker", () => ({
  trackClientSideError: vi.fn(),
}));

import { trackClientSideError } from "../../features/error_tracker";
import type { GameSettings, Player, TexasHoldemBoard } from "../../types";
import type { HandContext } from "./board_to_hand_request";
import { mapShowdownBoardToCreateHandRequest } from "./board_to_hand_request";

const defaultGameSettings: GameSettings = {
  smallBlind: 100,
  bigBlind: 200,
  minChip: 100,
  bbAnte: false,
};

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    position: 0,
    name: "Player",
    stack: 1000,
    hand: null,
    betInRound: 0,
    hasFolded: false,
    isAllIn: false,
    hasActed: false,
    ...overrides,
  };
}

function makeBoard(
  overrides: Partial<TexasHoldemBoard> = {},
): TexasHoldemBoard {
  const p1 = makePlayer({
    position: 0,
    name: "P1",
    stack: 1200,
    betInRound: 200,
  });
  const p2 = makePlayer({
    position: 1,
    name: "P2",
    stack: 800,
    hasFolded: true,
    betInRound: 200,
  });
  return {
    handNumber: 1,
    dealerPosition: 0,
    sbPosition: 0,
    bbPosition: 1,
    currentTurn: 0,
    currentBet: 0,
    players: [p1, p2],
    communityCards: [],
    pots: [{ amount: 400 }],
    phase: "showdown",
    winners: [0],
    ...overrides,
  };
}

const defaultHandContext: HandContext = {
  initialBoard: {
    players: [
      { id: "0", stack: 1000 },
      { id: "1", stack: 1000 },
    ],
  },
  gameStartedAt: "2024-01-01T12:00:00Z",
  actionHistory: [],
  sidePots: [],
};

describe("mapShowdownBoardToCreateHandRequest", () => {
  test("totalPot をプレイヤーの startingStack - endingStack から計算すること", async () => {
    const board = makeBoard({
      players: [
        makePlayer({ position: 0, stack: 1500, betInRound: 0 }),
        makePlayer({ position: 1, stack: 500, hasFolded: true, betInRound: 0 }),
      ],
    });

    const result = await mapShowdownBoardToCreateHandRequest(
      board,
      "session-1",
      "event-1",
      "table-1",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.totalPot).toBe(0);
    }
  });

  test("startingStack と endingStack を正しくマッピングすること", async () => {
    const board = makeBoard({
      players: [
        makePlayer({ position: 0, stack: 1500, betInRound: 0 }),
        makePlayer({ position: 1, stack: 500, hasFolded: true, betInRound: 0 }),
      ],
    });

    const result = await mapShowdownBoardToCreateHandRequest(
      board,
      "session-1",
      "event-1",
      "table-1",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const p0 = result.value.players.find((p) => p.seatPosition === 0);
      const p1 = result.value.players.find((p) => p.seatPosition === 1);
      expect.soft(p0?.startingStack).toBe(1000);
      expect.soft(p0?.endingStack).toBe(1500);
      expect.soft(p1?.startingStack).toBe(1000);
      expect.soft(p1?.endingStack).toBe(500);
    }
  });

  test("アクション履歴を正しくマッピングすること", async () => {
    const handContext: HandContext = {
      ...defaultHandContext,
      actionHistory: [
        {
          round: "preflop",
          playerId: "0",
          actionType: "bet",
          actionAmount: 200,
          actionOrder: 1,
          remainingStack: 800,
          timestamp: "2024-01-01T12:00:01Z",
        },
        {
          round: "preflop",
          playerId: "1",
          actionType: "fold",
          actionAmount: 0,
          actionOrder: 2,
          remainingStack: 1000,
          timestamp: "2024-01-01T12:00:02Z",
        },
      ],
    };

    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "session-1",
      "event-1",
      "table-1",
      "ring_game",
      handContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.actions).toHaveLength(2);
      expect.soft(result.value.actions[0].round).toBe("PREFLOP");
      expect.soft(result.value.actions[0].actionType).toBe("BET");
      expect.soft(result.value.actions[1].actionType).toBe("FOLD");
    }
  });

  test("gameStartedAt を startTime として使うこと", async () => {
    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "session-1",
      "event-1",
      "table-1",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.startTime).toBe("2024-01-01T12:00:00Z");
      expect(result.value.endTime).toBe("2024-01-01T12:30:00Z");
    }
  });

  test("gameStartedAt が null の場合は endTime を startTime に使うこと", async () => {
    const handContext: HandContext = {
      ...defaultHandContext,
      gameStartedAt: null,
    };

    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "session-1",
      "event-1",
      "table-1",
      "ring_game",
      handContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.startTime).toBe(result.value.endTime);
    }
  });

  test("handId を sessionId と handNumber から決定論的に生成すること", async () => {
    const board = makeBoard();
    const r1 = await mapShowdownBoardToCreateHandRequest(
      board,
      "session-abc",
      "event-1",
      "table-1",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );
    const r2 = await mapShowdownBoardToCreateHandRequest(
      board,
      "session-abc",
      "event-1",
      "table-1",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(r1.isOk()).toBe(true);
    expect(r2.isOk()).toBe(true);
    if (r1.isOk() && r2.isOk()) {
      expect(r1.value.handId).toBe(r2.value.handId);
      expect(r1.value.handId).toHaveLength(16);
    }
  });

  test("gameFormat を正しくマッピングすること", async () => {
    const r1 = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "s",
      "e",
      "t",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );
    const r2 = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "s",
      "e",
      "t",
      "tournament",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(r1.isOk() && r1.value.gameFormat).toBe("ring_game");
    expect(r2.isOk() && r2.value.gameFormat).toBe("tournament");
  });

  test("コミュニティカードを正しくマッピングすること（5枚）", async () => {
    const board = makeBoard({
      communityCards: [
        { suit: "spade", value: "A" },
        { suit: "heart", value: "K" },
        { suit: "diamond", value: "Q" },
        { suit: "club", value: "J" },
        { suit: "spade", value: "T" },
      ],
    });

    const result = await mapShowdownBoardToCreateHandRequest(
      board,
      "s",
      "e",
      "t",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect.soft(result.value.flopCards).toEqual([
        { suit: "SPADE", value: "A" },
        { suit: "HEART", value: "K" },
        { suit: "DIAMOND", value: "Q" },
      ]);
      expect.soft(result.value.turnCard).toEqual({ suit: "CLUB", value: "J" });
      expect.soft(result.value.riverCard).toEqual({
        suit: "SPADE",
        value: "T",
      });
    }
  });

  test("コミュニティカードがない場合は null をセットすること", async () => {
    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard({ communityCards: [] }),
      "s",
      "e",
      "t",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect.soft(result.value.flopCards).toBeNull();
      expect.soft(result.value.turnCard).toBeNull();
      expect.soft(result.value.riverCard).toBeNull();
    }
  });

  test("bbAnte が true の場合に ante = bigBlind をセットすること", async () => {
    const settings: GameSettings = {
      ...defaultGameSettings,
      bbAnte: true,
    };

    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "s",
      "e",
      "t",
      "ring_game",
      defaultHandContext,
      settings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect.soft(result.value.ante).toBe(200);
      expect.soft(result.value.bbAnte).toBe(true);
    }
  });

  test("bbAnte が false の場合に ante = 0 をセットすること", async () => {
    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "s",
      "e",
      "t",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect.soft(result.value.ante).toBe(0);
      expect.soft(result.value.bbAnte).toBe(false);
    }
  });

  test("不明な round の場合はエラーを返すこと", async () => {
    const handContext: HandContext = {
      ...defaultHandContext,
      actionHistory: [
        {
          round: "unknown_round",
          playerId: "0",
          actionType: "bet",
          actionAmount: 100,
          actionOrder: 1,
          remainingStack: 900,
          timestamp: "2024-01-01T12:00:01Z",
        },
      ],
    };

    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "s",
      "e",
      "t",
      "ring_game",
      handContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Unknown round: unknown_round");
    }
  });

  test("不明な actionType の場合はエラーを返すこと", async () => {
    const handContext: HandContext = {
      ...defaultHandContext,
      actionHistory: [
        {
          round: "preflop",
          playerId: "0",
          actionType: "unknown_action",
          actionAmount: 100,
          actionOrder: 1,
          remainingStack: 900,
          timestamp: "2024-01-01T12:00:01Z",
        },
      ],
    };

    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "s",
      "e",
      "t",
      "ring_game",
      handContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Unknown actionType: unknown_action",
      );
    }
  });

  test("BTN プレイヤーが見つからない場合は buttonPosition = 0 にしてエラーログを出力すること", async () => {
    vi.mocked(trackClientSideError).mockClear();
    const board = makeBoard({ dealerPosition: 99 });

    const result = await mapShowdownBoardToCreateHandRequest(
      board,
      "s",
      "e",
      "t",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.buttonPosition).toBe(0);
    }
    expect(vi.mocked(trackClientSideError)).toHaveBeenCalledWith(
      expect.stringContaining("[mapShowdownBoard] BTN player not found"),
    );
  });

  test("sidePots をハンドコンテキストからマッピングすること", async () => {
    const handContext: HandContext = {
      ...defaultHandContext,
      sidePots: [{ chip: 500, eligiblePlayers: ["0", "1"] }],
    };

    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "s",
      "e",
      "t",
      "ring_game",
      handContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect.soft(result.value.sidePots).toHaveLength(1);
      expect.soft(result.value.sidePots[0]?.chip).toBe(500);
      expect.soft(result.value.sidePots[0]?.eligiblePlayerIds).toHaveLength(2);
    }
  });

  test("eligiblePlayers が 1 人以下の sidePot は除外すること", async () => {
    const handContext: HandContext = {
      ...defaultHandContext,
      sidePots: [{ chip: 500, eligiblePlayers: ["0"] }],
    };

    const result = await mapShowdownBoardToCreateHandRequest(
      makeBoard(),
      "s",
      "e",
      "t",
      "ring_game",
      handContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sidePots).toHaveLength(0);
    }
  });

  test("ホールカードをプレイヤーから正しくマッピングすること", async () => {
    const board = makeBoard({
      players: [
        makePlayer({
          position: 0,
          hand: [
            { suit: "spade", value: "A" },
            { suit: "heart", value: "K" },
          ],
          stack: 1200,
        }),
        makePlayer({ position: 1, stack: 800, hasFolded: true }),
      ],
    });

    const result = await mapShowdownBoardToCreateHandRequest(
      board,
      "s",
      "e",
      "t",
      "ring_game",
      defaultHandContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const p0 = result.value.players.find((p) => p.seatPosition === 0);
      expect.soft(p0?.holeCards).toEqual([
        { suit: "SPADE", value: "A" },
        { suit: "HEART", value: "K" },
      ]);
    }
  });

  describe("derivePosition", () => {
    function makePositionBoard(
      playerPositions: number[],
      dealerPos: number,
      sbPos: number,
      bbPos: number,
    ): TexasHoldemBoard {
      const players = playerPositions.map((pos) =>
        makePlayer({ position: pos, stack: 1000 }),
      );
      return {
        handNumber: 1,
        dealerPosition: dealerPos,
        sbPosition: sbPos,
        bbPosition: bbPos,
        currentTurn: dealerPos,
        currentBet: 0,
        players,
        communityCards: [],
        pots: [{ amount: 0 }],
        phase: "showdown",
        winners: [],
      };
    }

    function makePositionHandContext(playerPositions: number[]): HandContext {
      return {
        initialBoard: {
          players: playerPositions.map((pos) => ({
            id: String(pos),
            stack: 1000,
          })),
        },
        gameStartedAt: "2024-01-01T12:00:00Z",
        actionHistory: [],
        sidePots: [],
      };
    }

    test("ヘッズアップ: dealer(BTN_SB) と BB が正しく割り当てられること", async () => {
      // 席 0, 1 で 2人
      const board = makePositionBoard([0, 1], 0, 0, 1);
      const handContext = makePositionHandContext([0, 1]);

      const result = await mapShowdownBoardToCreateHandRequest(
        board,
        "s",
        "e",
        "t",
        "ring_game",
        handContext,
        defaultGameSettings,
        "2024-01-01T12:30:00Z",
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const p0 = result.value.players.find((p) => p.seatPosition === 0);
        const p1 = result.value.players.find((p) => p.seatPosition === 1);
        expect.soft(p0?.position).toBe("BTN_SB");
        expect.soft(p1?.position).toBe("BB");
      }
    });

    test("3-handed: BTN=diff0, SB=diff1, BB=diff2 が正しく割り当てられること", async () => {
      // 席 0, 1, 2 で 3人, dealer=0, sb=1, bb=2
      const board = makePositionBoard([0, 1, 2], 0, 1, 2);
      const handContext = makePositionHandContext([0, 1, 2]);

      const result = await mapShowdownBoardToCreateHandRequest(
        board,
        "s",
        "e",
        "t",
        "ring_game",
        handContext,
        defaultGameSettings,
        "2024-01-01T12:30:00Z",
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const p0 = result.value.players.find((p) => p.seatPosition === 0);
        const p1 = result.value.players.find((p) => p.seatPosition === 1);
        const p2 = result.value.players.find((p) => p.seatPosition === 2);
        expect.soft(p0?.position).toBe("BTN");
        expect.soft(p1?.position).toBe("SB");
        expect.soft(p2?.position).toBe("BB");
      }
    });

    test("6-handed 連続席: BTN/SB/BB/UTG/HJ/CO が正しく割り当てられること", async () => {
      // 席 0,1,2,3,4,5 で 6人, dealer=0, sb=1, bb=2
      const board = makePositionBoard([0, 1, 2, 3, 4, 5], 0, 1, 2);
      const handContext = makePositionHandContext([0, 1, 2, 3, 4, 5]);

      const result = await mapShowdownBoardToCreateHandRequest(
        board,
        "s",
        "e",
        "t",
        "ring_game",
        handContext,
        defaultGameSettings,
        "2024-01-01T12:30:00Z",
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const p0 = result.value.players.find((p) => p.seatPosition === 0);
        const p1 = result.value.players.find((p) => p.seatPosition === 1);
        const p2 = result.value.players.find((p) => p.seatPosition === 2);
        const p3 = result.value.players.find((p) => p.seatPosition === 3);
        const p4 = result.value.players.find((p) => p.seatPosition === 4);
        const p5 = result.value.players.find((p) => p.seatPosition === 5);
        expect.soft(p0?.position).toBe("BTN");
        expect.soft(p1?.position).toBe("SB");
        expect.soft(p2?.position).toBe("BB");
        expect.soft(p3?.position).toBe("UTG");
        expect.soft(p4?.position).toBe("HJ");
        expect.soft(p5?.position).toBe("CO");
      }
    });

    test("空席あり 6人 (席 0,1,3,5,7,8): 行動順が正しく計算されること", async () => {
      // 9席テーブル、席 0,1,3,5,7,8 に着席 (席 2,4,6 は空席)
      // dealer=0, sb=1, bb=3 (次の実着席者)
      const board = makePositionBoard([0, 1, 3, 5, 7, 8], 0, 1, 3);
      const handContext = makePositionHandContext([0, 1, 3, 5, 7, 8]);

      const result = await mapShowdownBoardToCreateHandRequest(
        board,
        "s",
        "e",
        "t",
        "ring_game",
        handContext,
        defaultGameSettings,
        "2024-01-01T12:30:00Z",
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // sorted by position: [0, 1, 3, 5, 7, 8]
        // dealer=0 → diff=0 → BTN
        // 席1 → diff=1 → SB
        // 席3 → diff=2 → BB
        // 席5 → diff=3 → UTG
        // 席7 → diff=4 → HJ
        // 席8 → diff=5 → CO
        const p0 = result.value.players.find((p) => p.seatPosition === 0);
        const p1 = result.value.players.find((p) => p.seatPosition === 1);
        const p3 = result.value.players.find((p) => p.seatPosition === 3);
        const p5 = result.value.players.find((p) => p.seatPosition === 5);
        const p7 = result.value.players.find((p) => p.seatPosition === 7);
        const p8 = result.value.players.find((p) => p.seatPosition === 8);
        expect.soft(p0?.position).toBe("BTN");
        expect.soft(p1?.position).toBe("SB");
        expect.soft(p3?.position).toBe("BB");
        expect.soft(p5?.position).toBe("UTG");
        expect.soft(p7?.position).toBe("HJ");
        expect.soft(p8?.position).toBe("CO");
      }
    });

    test("空席あり dealer が中間席 (席 0,1,3,5,7,8, dealer=5): wrap-around で正しく計算されること", async () => {
      // dealer=5, sb=7, bb=8
      const board = makePositionBoard([0, 1, 3, 5, 7, 8], 5, 7, 8);
      const handContext = makePositionHandContext([0, 1, 3, 5, 7, 8]);

      const result = await mapShowdownBoardToCreateHandRequest(
        board,
        "s",
        "e",
        "t",
        "ring_game",
        handContext,
        defaultGameSettings,
        "2024-01-01T12:30:00Z",
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // sorted: [0, 1, 3, 5, 7, 8], dealer at index 3
        // 席5 → dealerIdx=3, diff=0 → BTN
        // 席7 → diff=1 → SB
        // 席8 → diff=2 → BB
        // 席0 → diff=3 → UTG  (wrap-around: idx=0, (0-3+6)%6=3)
        // 席1 → diff=4 → HJ
        // 席3 → diff=5 → CO
        const p5 = result.value.players.find((p) => p.seatPosition === 5);
        const p7 = result.value.players.find((p) => p.seatPosition === 7);
        const p8 = result.value.players.find((p) => p.seatPosition === 8);
        const p0 = result.value.players.find((p) => p.seatPosition === 0);
        const p1 = result.value.players.find((p) => p.seatPosition === 1);
        const p3 = result.value.players.find((p) => p.seatPosition === 3);
        expect.soft(p5?.position).toBe("BTN");
        expect.soft(p7?.position).toBe("SB");
        expect.soft(p8?.position).toBe("BB");
        expect.soft(p0?.position).toBe("UTG");
        expect.soft(p1?.position).toBe("HJ");
        expect.soft(p3?.position).toBe("CO");
      }
    });
  });

  test("initialBoard が null の場合は fallback startingStack を使うこと", async () => {
    const handContext: HandContext = {
      ...defaultHandContext,
      initialBoard: null,
    };
    const board = makeBoard({
      players: [
        makePlayer({ position: 0, stack: 0, betInRound: 1000 }),
        makePlayer({
          position: 1,
          stack: 500,
          betInRound: 500,
          hasFolded: true,
        }),
      ],
    });

    const result = await mapShowdownBoardToCreateHandRequest(
      board,
      "s",
      "e",
      "t",
      "ring_game",
      handContext,
      defaultGameSettings,
      "2024-01-01T12:30:00Z",
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const p0 = result.value.players.find((p) => p.seatPosition === 0);
      expect(p0?.startingStack).toBe(1000);
    }
  });
});
