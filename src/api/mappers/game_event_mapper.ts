import type { GameEventResponse, GameSessionResponse } from "../backend";

export type MappedGameEvent = {
  gameEventId: string;
  gameName: string;
  gameFormat: "ring_game" | "tournament";
  status: "pending" | "started" | "finished";
  startDate: string;
  startedTableId: string | null;
  defaultStack: number | null;
};

export function fromGameEventResponse(
  event: GameEventResponse,
): MappedGameEvent {
  return {
    gameEventId: event.gameEventId,
    gameName: event.gameName ?? "",
    gameFormat: event.gameFormat,
    status: event.status,
    startDate: event.startDate,
    startedTableId: event.startedTableId,
    defaultStack: event.defaultStack,
  };
}

export function sessionGameFormat(
  session: GameSessionResponse,
): "ring_game" | "tournament" {
  const event = session as { gameFormat?: string };
  if (event.gameFormat === "tournament") return "tournament";
  return "ring_game";
}
