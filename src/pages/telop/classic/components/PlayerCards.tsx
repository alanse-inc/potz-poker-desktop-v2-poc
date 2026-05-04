import type { Player, TexasHoldemBoard } from "../../../../types";
import type { PlayerCardSize } from "../../types";
import { ClassicPlayerCard } from "./PlayerCard";

type Props = {
  board: TexasHoldemBoard;
  players: Player[];
  side: "left" | "right";
  size?: PlayerCardSize;
};

/**
 * Classic テーマ プレイヤーカードリスト
 */
export function ClassicPlayerCards({ board, players, side, size }: Props) {
  return (
    <div
      className={`flex flex-col gap-1 ${side === "right" ? "items-end" : "items-start"}`}
    >
      {players.map((player) => (
        <ClassicPlayerCard
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
