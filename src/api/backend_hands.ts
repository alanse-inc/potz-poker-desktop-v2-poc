import { trackClientSideError } from "../features/error_tracker";
import { authenticatedFetch } from "./authenticated_fetch";

const BASE_URL =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_URL
    ? import.meta.env.VITE_BACKEND_API_URL
    : "http://localhost:8080";

export type CardRequest = {
  suit: "SPADE" | "HEART" | "DIAMOND" | "CLUB";
  value:
    | "A"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "T"
    | "J"
    | "Q"
    | "K";
};

export type HandRank =
  | "high_card"
  | "one_pair"
  | "two_pair"
  | "three_of_a_kind"
  | "straight"
  | "flush"
  | "full_house"
  | "four_of_a_kind"
  | "straight_flush"
  | "royal_flush";

export type CreateHandPlayerRequest = {
  playerId: string;
  seatPosition: number;
  position:
    | "BTN"
    | "BTN_SB"
    | "SB"
    | "BB"
    | "UTG"
    | "UTG+1"
    | "UTG+2"
    | "UTG+3"
    | "MP"
    | "HJ"
    | "CO";
  holeCards: [CardRequest, CardRequest] | null;
  handRank: HandRank | null;
  bestHandCards: CardRequest[] | null;
  startingStack: number;
  endingStack: number;
  totalBet: number;
};

export type CreateHandActionRequest = {
  round: "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";
  playerId: string;
  actionType: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";
  actionAmount: number;
  actionOrder: number;
  remainingStack: number;
  timestamp: string;
};

export type CreateHandRequest = {
  handId: string;
  sessionId: string;
  gameEventId: string;
  handNumber: number;
  tableId: string;
  gameRule: "texas_holdem";
  gameFormat: "ring_game" | "tournament";
  buttonPosition: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  bbAnte: boolean;
  totalPot: number;
  playerCount: number;
  flopCards: [CardRequest, CardRequest, CardRequest] | null;
  turnCard: CardRequest | null;
  riverCard: CardRequest | null;
  startTime: string;
  endTime: string;
  players: CreateHandPlayerRequest[];
  actions: CreateHandActionRequest[];
  sidePots: Array<{ chip: number; eligiblePlayerIds: string[] }>;
};

export type CreateHandResponse = {
  handId: string;
  status: "accepted";
};

export type BackendApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export async function createHand(
  request: CreateHandRequest,
  getAccessToken: () => Promise<string | null>,
): Promise<BackendApiResult<CreateHandResponse>> {
  const url = `${BASE_URL}/v1/hands`;
  try {
    const response = await authenticatedFetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
      getAccessToken,
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail =
        body != null &&
        typeof body === "object" &&
        "detail" in body &&
        typeof (body as Record<string, unknown>).detail === "string"
          ? (body as Record<string, unknown>).detail
          : `HTTP ${response.status}`;
      return { ok: false, status: response.status, message: detail as string };
    }
    const data = (await response.json()) as CreateHandResponse;
    return { ok: true, data };
  } catch (error) {
    trackClientSideError("[createHand] Network error", { cause: error });
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}
