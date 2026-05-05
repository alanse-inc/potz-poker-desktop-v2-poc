import { err, ok, type Result } from "neverthrow";
import { trackClientSideError } from "../../features/error_tracker";
import type { Card, GameSettings, Player, TexasHoldemBoard } from "../../types";
import type {
  CardRequest,
  CreateHandActionRequest,
  CreateHandPlayerRequest,
  CreateHandRequest,
} from "../backend_hands";

export type HandContext = {
  initialBoard: {
    players: Array<{ id: string; stack: number }>;
  } | null;
  gameStartedAt: string | null;
  actionHistory: Array<{
    round: string;
    playerId: string;
    actionType: string;
    actionAmount: number;
    actionOrder: number;
    remainingStack: number;
    timestamp: string;
  }>;
  sidePots: Array<{
    chip: number;
    eligiblePlayers: string[];
  }>;
};

type ActionType = CreateHandActionRequest["actionType"];
type Round = CreateHandActionRequest["round"];
type PlayerPosition = CreateHandPlayerRequest["position"];

const SUIT_MAP: Record<string, CardRequest["suit"]> = {
  spade: "SPADE",
  heart: "HEART",
  diamond: "DIAMOND",
  club: "CLUB",
};

function mapCard(card: Card): CardRequest {
  return {
    suit: SUIT_MAP[card.suit] ?? "SPADE",
    value: card.value as CardRequest["value"],
  };
}

const ACTION_TYPE_MAP: Record<string, ActionType> = {
  bet: "BET",
  call: "CALL",
  check: "CHECK",
  fold: "FOLD",
  raise: "RAISE",
  allin: "ALL_IN",
};

const ROUND_MAP: Record<string, Round> = {
  preflop: "PREFLOP",
  flop: "FLOP",
  turn: "TURN",
  river: "RIVER",
  showdown: "SHOWDOWN",
};

const VALID_ACTION_TYPES: Set<string> = new Set(Object.keys(ACTION_TYPE_MAP));
const VALID_ROUNDS: Set<string> = new Set(Object.keys(ROUND_MAP));

function isValidActionType(value: string): boolean {
  return VALID_ACTION_TYPES.has(value);
}

function isValidRound(value: string): boolean {
  return VALID_ROUNDS.has(value);
}

async function generateHandId(
  sessionId: string,
  handNumber: number,
): Promise<string> {
  const input = `${sessionId}:${handNumber}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex.slice(0, 16);
}

function derivePosition(
  player: Player,
  board: TexasHoldemBoard,
  activePlayers: Player[],
): PlayerPosition {
  const pos = player.position;
  const totalPlayers = activePlayers.length;

  if (pos === board.dealerPosition) {
    if (totalPlayers === 2) return "BTN_SB";
    return "BTN";
  }
  if (pos === board.sbPosition) return "SB";
  if (pos === board.bbPosition) return "BB";

  // dealer がスタック0で activePlayers から除外されている場合でも
  // ポジション計算はシーティング順序に基づくため board.players（全 seated players）を使う
  const sorted = [...board.players].sort((a, b) => a.position - b.position);
  const dealerIdx = sorted.findIndex(
    (p) => p.position === board.dealerPosition,
  );
  const playerIdx = sorted.findIndex((p) => p.position === player.position);
  const n = sorted.length;
  const diff = (playerIdx - dealerIdx + n) % n;

  if (totalPlayers <= 4) {
    if (diff === 3) return "UTG";
  } else if (totalPlayers === 5) {
    if (diff === 3) return "UTG";
    if (diff === 4) return "CO";
  } else if (totalPlayers === 6) {
    if (diff === 3) return "UTG";
    if (diff === 4) return "HJ";
    if (diff === 5) return "CO";
  } else if (totalPlayers === 7) {
    if (diff === 3) return "UTG";
    if (diff === 4) return "MP";
    if (diff === 5) return "HJ";
    if (diff === 6) return "CO";
  } else if (totalPlayers === 8) {
    if (diff === 3) return "UTG";
    if (diff === 4) return "UTG+1";
    if (diff === 5) return "MP";
    if (diff === 6) return "HJ";
    if (diff === 7) return "CO";
  } else if (totalPlayers === 9) {
    if (diff === 3) return "UTG";
    if (diff === 4) return "UTG+1";
    if (diff === 5) return "UTG+2";
    if (diff === 6) return "MP";
    if (diff === 7) return "HJ";
    if (diff === 8) return "CO";
  } else {
    if (diff === 3) return "UTG";
    if (diff === 4) return "UTG+1";
    if (diff === 5) return "UTG+2";
    if (diff === 6) return "UTG+3";
    if (diff === 7) return "MP";
    if (diff === 8) return "HJ";
    if (diff === 9) return "CO";
  }
  console.error(`derivePosition: unexpected diff value: ${diff}`);
  return "UTG";
}

function mapActions(
  actionHistory: HandContext["actionHistory"],
  participatingPositions: Set<string>,
): Result<CreateHandActionRequest[], Error> {
  const actions: CreateHandActionRequest[] = [];
  for (const a of actionHistory) {
    if (!participatingPositions.has(a.playerId)) continue;
    if (!isValidRound(a.round)) {
      return err(new Error(`Unknown round: ${a.round}`));
    }
    const round = ROUND_MAP[a.round] as Round;
    if (!isValidActionType(a.actionType)) {
      return err(new Error(`Unknown actionType: ${a.actionType}`));
    }
    const actionType = ACTION_TYPE_MAP[a.actionType] as ActionType;
    actions.push({
      round,
      playerId: a.playerId,
      actionType,
      actionAmount: a.actionAmount,
      actionOrder: a.actionOrder,
      remainingStack: a.remainingStack,
      timestamp: a.timestamp,
    });
  }
  return ok(actions);
}

export async function mapShowdownBoardToCreateHandRequest(
  board: TexasHoldemBoard,
  sessionId: string,
  gameEventId: string,
  tableId: string,
  gameFormat: "ring_game" | "tournament",
  handContext: HandContext,
  gameSetting: GameSettings,
  endTime: string,
): Promise<Result<CreateHandRequest, Error>> {
  const handId = await generateHandId(sessionId, board.handNumber);

  const startingStackMap = new Map<string, number>();
  if (handContext.initialBoard) {
    for (const p of handContext.initialBoard.players) {
      startingStackMap.set(p.id, Number(p.stack));
    }
  }

  const activePlayers = board.players.filter((p) => {
    if (handContext.initialBoard) {
      const s = startingStackMap.get(String(p.position));
      return s !== undefined && s > 0;
    }
    return true;
  });

  const totalPot = activePlayers.reduce((sum, p) => {
    const starting =
      startingStackMap.get(String(p.position)) ?? p.stack + (p.betInRound ?? 0);
    const ending = p.stack;
    return sum + (starting - ending);
  }, 0);

  const participatingPositions = new Set<string>(
    activePlayers.map((p) => String(p.position)),
  );

  const players: CreateHandPlayerRequest[] = activePlayers.map((player) => {
    const playerId = String(player.position);
    const starting =
      startingStackMap.get(playerId) ?? player.stack + (player.betInRound ?? 0);
    const endingStack = player.stack;
    const totalBet = starting - endingStack;
    const holeCards =
      player.hand && player.hand.length === 2
        ? ([mapCard(player.hand[0]), mapCard(player.hand[1])] as [
            CardRequest,
            CardRequest,
          ])
        : null;

    const position = derivePosition(player, board, activePlayers);

    return {
      playerId,
      seatPosition: player.position,
      position,
      holeCards,
      handRank: null,
      bestHandCards: null,
      startingStack: starting,
      endingStack,
      totalBet,
    } satisfies CreateHandPlayerRequest;
  });

  const actionsResult = mapActions(
    handContext.actionHistory,
    participatingPositions,
  );
  if (actionsResult.isErr()) {
    return err(actionsResult.error);
  }

  const startTime = handContext.gameStartedAt ?? endTime;

  const btnPlayerIndex = activePlayers.findIndex(
    (p) => p.position === board.dealerPosition,
  );
  if (btnPlayerIndex < 0) {
    trackClientSideError(
      `[mapShowdownBoard] BTN player not found, defaulting to position 0 (handNumber: ${board.handNumber})`,
    );
  }
  const buttonPosition = btnPlayerIndex >= 0 ? btnPlayerIndex : 0;

  const cc = board.communityCards;
  const flopCards =
    cc.length >= 3
      ? ([mapCard(cc[0]), mapCard(cc[1]), mapCard(cc[2])] as [
          CardRequest,
          CardRequest,
          CardRequest,
        ])
      : null;
  const turnCard = cc.length >= 4 ? mapCard(cc[3]) : null;
  const riverCard = cc.length >= 5 ? mapCard(cc[4]) : null;

  const ante = gameSetting.bbAnte ? gameSetting.bigBlind : 0;

  return ok({
    handId,
    sessionId,
    gameEventId,
    handNumber: board.handNumber,
    tableId,
    gameRule: "texas_holdem",
    gameFormat,
    buttonPosition,
    smallBlind: gameSetting.smallBlind,
    bigBlind: gameSetting.bigBlind,
    ante,
    bbAnte: gameSetting.bbAnte,
    totalPot,
    sidePots: handContext.sidePots
      .map((sp) => ({
        chip: sp.chip,
        eligiblePlayerIds: sp.eligiblePlayers
          .map((pid) => (participatingPositions.has(pid) ? pid : undefined))
          .filter((id): id is string => id !== undefined),
      }))
      .filter((sp) => sp.eligiblePlayerIds.length >= 2),
    playerCount: activePlayers.length,
    flopCards,
    turnCard,
    riverCard,
    startTime,
    endTime,
    players,
    actions: actionsResult.value,
  });
}
