import { useMemo } from "react";
import { useAutoBoard } from "../../../contexts/auto_board_context";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../../domain/auto_game/types";

export type UseAutoTelopDataResult = {
  board: AutoModeBoard;
  players: AutoModePlayer[];
};

function buildMockBoard(): AutoModeBoard {
  const suits = ["spade", "heart", "club", "diamond"] as const;
  const values = [
    "A",
    "K",
    "Q",
    "J",
    "T",
    "9",
    "8",
    "7",
    "6",
    "5",
    "4",
    "3",
    "2",
  ] as const;
  const allCards: Array<{
    suit: (typeof suits)[number];
    value: (typeof values)[number];
  }> = [];
  for (const suit of suits) {
    for (const value of values) {
      allCards.push({ suit, value });
    }
  }

  const players: AutoModePlayer[] = Array.from({ length: 9 }, (_, index) => {
    const seat = index + 1;
    const card1 = allCards[index * 2];
    const card2 = allCards[index * 2 + 1];

    let position: "btn" | "sb" | "bb" | null = null;
    if (index === 0) position = "btn";
    if (index === 1) position = "sb";
    if (index === 2) position = "bb";

    return {
      id: `Player${seat}`,
      name: `Player${seat}`,
      icon: null,
      seat,
      position,
      action: null,
      hand: [card1, card2],
      odds: 0.2 + index * 0.05,
    };
  });

  return {
    setting: { name: "Auto Poker" },
    players,
    communityCards: [],
    burnCards: [],
    handNumber: 1,
    winners: null,
  };
}

export function useAutoTelopData(): UseAutoTelopDataResult {
  const { board: autoBoard } = useAutoBoard();

  const mockBoard = useMemo(() => buildMockBoard(), []);

  const players = useMemo(() => {
    if (!autoBoard) {
      return mockBoard.players.filter((player) => {
        const hasValidHand = player.hand.length >= 2;
        return hasValidHand;
      });
    }

    return autoBoard.players.filter((player) => {
      const hasValidHand =
        player.hand.length >= 2 && player.hand.every((card) => card != null);
      const isActive = player.action !== "fold";
      return hasValidHand && isActive;
    });
  }, [autoBoard, mockBoard]);

  const displayBoard = useMemo(() => {
    if (!autoBoard) {
      return mockBoard;
    }
    return autoBoard;
  }, [autoBoard, mockBoard]);

  return {
    board: displayBoard,
    players,
  };
}
