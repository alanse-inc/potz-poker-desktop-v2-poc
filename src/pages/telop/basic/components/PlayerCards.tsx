import type { Player, TexasHoldemBoard } from "../../../../types";
import type { PlayerCardSize } from "../../types";
import { BasicPlayerCard } from "./PlayerCard";

type Props = {
  board: TexasHoldemBoard;
  players: Player[];
  side: "left" | "right";
  size?: PlayerCardSize;
};

/**
 * Basic テーマ プレイヤーカードリスト
 */
export function BasicPlayerCards({ board, players, side, size }: Props) {
  return (
    <div
      className={`flex flex-col gap-2 ${side === "right" ? "items-end" : "items-start"}`}
    >
      {players.map((player) => (
        <BasicPlayerCard
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
