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
 * Basic テーマ プレイヤー情報カード
 */
export function BasicPlayerCard({
  board,
  player,
  size = "small",
  isCurrentPlayer = false,
}: Props) {
  const position = getPositionLabel(player, board);
  const actionDisplay = getActionDisplay(player, board);
  const isWinner = board.winners.includes(player.position);
  const hand = player.hand ?? [];

  const containerClass =
    size === "small"
      ? "w-[280px] py-2 px-3 gap-1.5"
      : "w-[400px] py-3 px-4 gap-2";
  const stackClass = size === "small" ? "text-sm" : "text-lg";
  const positionBadgeClass =
    size === "small" ? "text-sm px-1 py-0.5" : "text-base px-1.5 py-1";
  const playerNameClass = size === "small" ? "text-base" : "text-xl";
  const actionClass = size === "small" ? "text-sm" : "text-lg";
  const rowGapClass = size === "small" ? "gap-3" : "gap-4";

  return (
    <div
      className={`relative flex flex-col justify-center rounded-md border-2 border-[#D0D5DD] ${containerClass}`}
      style={{
        background:
          "linear-gradient(46deg, rgba(0, 0, 0, 1) 0%, rgba(85, 85, 85, 1) 100%)",
        boxShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)",
      }}
    >
      {/* 上段: アイコン + ポジション/名前 + カード */}
      <div className={`flex items-stretch ${rowGapClass}`}>
        {/* プレイヤーアイコン (簡易) */}
        <div className="flex shrink-0 items-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500 font-bold text-white text-xs">
            {player.name.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* ポジション + 名前 */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          {position && (
            <span
              className={`w-fit rounded font-bold text-[#222222] uppercase ${positionBadgeClass}`}
              style={{ backgroundColor: "#D9D9D9" }}
            >
              {position}
            </span>
          )}
          <span
            className={`font-bold text-[#F2F2F2] uppercase ${playerNameClass}`}
          >
            {player.name}
          </span>
        </div>

        {/* カード */}
        <div className="flex shrink-0 items-center gap-1.5">
          {[...Array(2)].map((_, index) => {
            const card = hand[index];
            return card ? (
              <TelopFaceCard
                key={`card-${index}-${player.position}`}
                card={card}
                size={size}
              />
            ) : (
              <TelopReverseCard
                key={`reverse-${index}-${player.position}`}
                size={size}
              />
            );
          })}
        </div>
      </div>

      {/* 下段: スタック + アクション */}
      <div className="flex items-center gap-1.5">
        <p className={`font-bold text-[#F2F2F2] ${stackClass}`}>
          {formatChipWithSuffix(player.stack)}
        </p>
        {actionDisplay && (
          <span
            className={`flex-1 font-bold text-[#F2F2F2] uppercase ${actionClass}`}
          >
            {actionDisplay}
          </span>
        )}
        {isCurrentPlayer && (
          <span className="font-bold text-xs text-yellow-400">▶</span>
        )}
      </div>

      {/* 勝者マーク */}
      {isWinner && (
        <div className="absolute right-[-40px] flex items-center justify-center">
          <img alt="winner" className="ml-3 h-10 w-10" src={CheckMarkSvg} />
        </div>
      )}
    </div>
  );
}
