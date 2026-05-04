import { describe, expect, test } from "vitest";
import type { GameEventResponse } from "../backend";
import { fromGameEventResponse } from "./game_event_mapper";

const baseEvent: GameEventResponse = {
  gameEventId: "event-123",
  venueId: "venue-1",
  gameTableId: "table-1",
  gameRule: "texas_holdem",
  gameFormat: "ring_game",
  status: "started",
  gameName: "Test Game",
  defaultStack: null,
  miniChip: 100,
  smallBlind: 100,
  bigBlind: 200,
  anteRule: "none",
  blindExceptionRule: "dead_button",
  startDate: "2024-01-01",
  startedAt: "2024-01-01T12:00:00Z",
  finishedAt: null,
  startedTableId: "table-1",
};

describe("fromGameEventResponse", () => {
  test("GameEventResponse を MappedGameEvent に変換すること", () => {
    const result = fromGameEventResponse(baseEvent);

    expect(result.gameEventId).toBe("event-123");
    expect(result.gameName).toBe("Test Game");
    expect(result.gameFormat).toBe("ring_game");
    expect(result.status).toBe("started");
    expect(result.startDate).toBe("2024-01-01");
    expect(result.startedTableId).toBe("table-1");
    expect(result.defaultStack).toBeNull();
  });

  test("tournament フォーマットを正しく変換すること", () => {
    const tournamentEvent: GameEventResponse = {
      ...baseEvent,
      gameFormat: "tournament",
      defaultStack: 10000,
    };

    const result = fromGameEventResponse(tournamentEvent);

    expect(result.gameFormat).toBe("tournament");
    expect(result.defaultStack).toBe(10000);
  });

  test("gameName が空文字の場合に空文字を返すこと", () => {
    const eventWithNoName: GameEventResponse = {
      ...baseEvent,
      gameName: "",
    };

    const result = fromGameEventResponse(eventWithNoName);

    expect(result.gameName).toBe("");
  });
});
