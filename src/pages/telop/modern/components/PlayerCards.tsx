import type { Player, TexasHoldemBoard } from "../../../../types";
import type { PlayerCardSize } from "../../types";
import { ModernPlayerCard } from "./PlayerCard";

type Props = {
  board: TexasHoldemBoard;
  players: Player[];
  side: "left" | "right";
  size?: PlayerCardSize;
};

/**
 * Modern テーマ プレイヤーカードリスト
 */
export function ModernPlayerCards({ board, players, side, size }: Props) {
  return (
    <div
      className={`flex flex-col gap-1 ${side === "right" ? "items-end" : "items-start"}`}
    >
      {players.map((player) => (
        <ModernPlayerCard
          key={player.position}
          board={board}
          player={player}
          size={size}
          isCurrentPlayer={player.position === board.currentTurn}
        />
      ))}
    </div>
  );
}
