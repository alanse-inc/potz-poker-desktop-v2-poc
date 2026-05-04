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
 * Modern テーマ プレイヤー情報カード
 * FuturaPT フォント、グリッドレイアウト
 */
export function ModernPlayerCard({
  board,
  player,
  size = "small",
  isCurrentPlayer: _isCurrentPlayer = false,
}: Props) {
  const position = getPositionLabel(player, board);
  const actionDisplay = getActionDisplay(player, board);
  const isWinner = board.winners.includes(player.position);
  const hand = player.hand ?? [];

  const containerClass =
    size === "small"
      ? "w-[280px] min-w-[280px] px-2 py-1"
      : "w-[340px] min-w-[340px] px-2 py-2";
  const nameClass =
    size === "small" ? "text-2xl font-extrabold" : "text-2xl font-extrabold";
  const stackClass =
    size === "small" ? "text-xl font-extrabold" : "text-2xl font-extrabold";
  const actionClass =
    size === "small" ? "text-xl font-extrabold" : "text-2xl font-extrabold";
  const positionClass =
    size === "small"
      ? "text-md font-extrabold uppercase"
      : "text-lg font-extrabold uppercase";
  const winnerIconClass =
    size === "small" ? "h-6 w-6 invert" : "h-8 w-8 invert";

  return (
    <div
      style={{ fontFamily: "FuturaCyrillicHeavy" }}
      className={`relative rounded-xl ${containerClass}`}
    >
      {/* 上段：アイコン + カード・ポジション・名前 */}
      <div className="grid grid-cols-4 items-stretch">
        {/* アイコン */}
        <div className="mr-0.5 flex items-end justify-center">
          <div className="flex h-18 w-18 items-center justify-center overflow-hidden rounded-t-md bg-gray-600 font-bold text-lg text-white">
            {player.name.charAt(0).toUpperCase()}
          </div>
        </div>

        <div className="col-span-3 flex flex-col">
          {/* カード */}
          <div className="flex items-end justify-between">
            <div className="flex gap-0.5">
              {[...Array(2)].map((_, index) =>
                hand[index] ? (
                  <TelopFaceCard
                    key={`card-${player.position}-${index}`}
                    card={hand[index]}
                    size={size}
                  />
                ) : (
                  <TelopReverseCard
                    key={`reverse-${player.position}-${index}`}
                    size={size}
                  />
                ),
              )}
            </div>
          </div>

          {/* ポジション + 名前 + 勝者 */}
          <div className="flex items-center justify-center gap-2 rounded-tr-sm bg-white px-2 py-0.5">
            <span className={positionClass}>{position}</span>
            <span className={nameClass}>{player.name}</span>
            {isWinner && (
              <img
                alt="winner"
                className={winnerIconClass}
                src={CheckMarkSvg}
              />
            )}
          </div>
        </div>
      </div>

      {/* 下段: スタック + アクション */}
      <div className="flex">
        <div className="flex flex-1 items-center justify-center bg-black px-2 py-0.5 text-white">
          <div className={stackClass}>{formatChipWithSuffix(player.stack)}</div>
        </div>
        <div
          className={`${actionClass} flex flex-2 items-center justify-center bg-black px-2 py-0.5 text-white`}
        >
          {actionDisplay && <span>{actionDisplay}</span>}
        </div>
      </div>
    </div>
  );
}
