import { formatChipWithSuffix } from "../../../../features/chip/format_chip_with_suffix";
import type { Player, TexasHoldemBoard } from "../../../../types";
import CheckMarkSvg from "../../check_mark.svg";
import { TelopFaceCard, TelopReverseCard } from "../../components/TelopCard";
import type { PlayerCardSize } from "../../types";
import { getActionDisplay, getPositionLabel } from "../../utils";

type Props = {
  board: TexasHoldemBoard;
  player: Player;
  size?: PlayerCardSize;
  isCurrentPlayer?: boolean;
};

/**
 * Broadcast テーマ プレイヤー情報カード
 * Montserrat italic フォント、赤背景(#BB251A)
 * レイアウト: 上段=カード、中段=名前、下段=3分割(Stack|Position|Action)
 */
export function BroadcastPlayerCard({
  board,
  player,
  size = "small",
  isCurrentPlayer: _isCurrentPlayer = false,
}: Props) {
  const position = getPositionLabel(player, board);
  const actionDisplay = getActionDisplay(player, board);
  const isWinner = board.winners.includes(player.position);
  const hand = player.hand ?? [];

  const containerClass = size === "small" ? "w-[242px]" : "w-[336px]";
  const nameClass =
    size === "small" ? "text-xl font-bold" : "text-2xl font-bold";
  const infoTextClass =
    size === "small" ? "text-lg font-bold" : "text-xl font-bold";
  const winnerIconClass = size === "small" ? "ml-2 h-5 w-5" : "ml-3 h-6 w-6";

  return (
    <div
      style={{ fontFamily: "Montserrat", fontStyle: "italic" }}
      className={`flex flex-col rounded-xl ${containerClass}`}
    >
      {/* 上段: カード */}
      <div className="mb-2 flex items-end">
        <div className="mr-3 flex gap-2">
          {[...Array(2)].map((_, index) =>
            hand[index] ? (
              <TelopFaceCard
                key={`card-${index}-${player.position}`}
                card={hand[index]}
                size={size}
              />
            ) : (
              <TelopReverseCard
                key={`reverse-${index}-${player.position}`}
                size={size}
              />
            ),
          )}
        </div>
      </div>

      {/* 中段: 名前（赤背景 #BB251A） */}
      <div
        className="relative mb-1 flex items-center justify-center rounded-xs px-4 py-1 text-white"
        style={{ backgroundColor: "#BB251A" }}
      >
        <div className="flex w-full items-center justify-center">
          <span className={nameClass}>{player.name}</span>
          {isWinner && (
            <img alt="winner" className={winnerIconClass} src={CheckMarkSvg} />
          )}
        </div>
      </div>

      {/* 下段: 3分割（Stack | Position | Action） */}
      <div className="flex gap-1">
        {/* Stack */}
        <div
          className={`flex flex-1 items-center justify-center rounded-xs bg-black px-2 py-1.5 text-center text-white ${infoTextClass}`}
        >
          {formatChipWithSuffix(player.stack)}
        </div>

        {/* Position */}
        <div
          className={`flex flex-1 items-center justify-center rounded-xs bg-black px-2 py-1.5 text-center text-white uppercase ${infoTextClass}`}
        >
          {position || "-"}
        </div>

        {/* Action */}
        <div
          className={`flex flex-[2] items-center justify-center rounded-xs bg-black px-2 py-1.5 text-center text-white ${infoTextClass}`}
        >
          {actionDisplay || "-"}
        </div>
      </div>
    </div>
  );
}
