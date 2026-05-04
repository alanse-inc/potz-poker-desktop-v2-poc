import { useMemo } from "react";
import { match } from "ts-pattern";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../../domain/auto_game/types";

export function useAutoPlayerDisplayHelpers({
  player,
  board,
}: {
  player: AutoModePlayer;
  board?: AutoModeBoard;
}) {
  const odds = useMemo(() => {
    if (board && board.communityCards.length === 5) {
      return null;
    }
    return player.odds !== null && player.odds !== undefined
      ? `${(player.odds * 100).toFixed(1)}%`
      : null;
  }, [player.odds, board]);

  const isFolded = player.action === "fold";
  const hand = player.hand || [];

  const position = player.position
    ? match(player.position)
        .with("btn", () => "BTN")
        .with("btn_sb", () => "BTN/SB")
        .with("bb", () => "BB")
        .with("sb", () => "SB")
        .with("utg", () => "UTG")
        .with("utg_plus_1", () => "+1")
        .with("utg_plus_2", () => "+2")
        .with("utg_plus_3", () => "+3")
        .with("mp", () => "MP")
        .with("hj", () => "HJ")
        .with("co", () => "CO")
        .exhaustive()
    : null;

  const isWinner = useMemo(() => {
    if (!board) return false;
    if (board.communityCards.length !== 5) return false;
    if (player.action === "fold") return false;
    return board.winners?.includes(player.id) ?? false;
  }, [board, player]);

  return { odds, isFolded, hand, position, isWinner };
}
