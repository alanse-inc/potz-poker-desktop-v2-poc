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
 * Classic テーマ プレイヤー情報カード
 * Oswald フォント、3段構造レイアウト（全て黒背景・白テキスト、中段は青背景）
 *
 * レイアウト:
 * - 上段: 写真 | カード2枚 | 右上エリア（ポジション + スタック 縦並び）
 * - 中段: プレイヤー名（青背景 #336699）
 * - 下段: アクション/ベット額（黒背景）
 */
export function ClassicPlayerCard({
  board,
  player,
  size = "small",
  isCurrentPlayer: _isCurrentPlayer = false,
}: Props) {
  const position = getPositionLabel(player, board);
  const actionDisplay = getActionDisplay(player, board);
  const isWinner = board.winners.includes(player.position);
  const hand = player.hand ?? [];

  const containerWidth = size === "small" ? 250 : 360;
  const photoSize =
    size === "small" ? { width: 62, height: 62 } : { width: 96, height: 96 };
  const rightAreaWidth = size === "small" ? 80 : 88;
  const middleBarHeight = size === "small" ? 30 : 42;
  const lowerBarHeight = size === "small" ? 32 : 44;

  const oddsTextClass = size === "small" ? "text-[13px]" : "text-[18px]";
  const positionTextClass = size === "small" ? "text-[14px]" : "text-[20px]";
  const nameTextClass = size === "small" ? "text-[18px]" : "text-[26px]";
  const actionTextClass = size === "small" ? "text-[20px]" : "text-[28px]";
  const winnerIconClass = size === "small" ? "h-5 w-5" : "h-7 w-7";
  const borderRadius = size === "small" ? 4 : 6;
  const gap = 2;

  return (
    <div
      style={{ width: containerWidth, fontFamily: "Oswald", gap }}
      className="flex flex-col font-bold"
    >
      {/* 上段: 写真 + カード2枚 + 右上エリア（ポジション + スタック 縦並び） */}
      <div className="flex items-end" style={{ gap }}>
        {/* プレイヤー写真（簡易アイコン） */}
        <div
          className="flex flex-shrink-0 items-center justify-center overflow-hidden border-2 border-white bg-gray-700 font-bold text-white"
          style={{
            width: photoSize.width,
            height: photoSize.height,
            borderRadius,
          }}
        >
          {player.name.charAt(0).toUpperCase()}
        </div>

        {/* カード2枚 */}
        <div className="flex" style={{ gap }}>
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

        {/* 右上エリア: ポジション + スタック 縦並び */}
        <div
          className="ml-auto flex flex-col"
          style={{
            width: rightAreaWidth,
            height: photoSize.height,
            gap: 2,
          }}
        >
          {/* ポジション（上） */}
          <div
            className={`flex flex-1 items-center justify-center rounded-sm border-2 border-white bg-black text-white ${positionTextClass}`}
          >
            {position || "-"}
          </div>

          {/* スタック（下） */}
          <div
            className={`flex flex-1 items-center justify-center rounded-sm border-2 border-white bg-black text-white ${oddsTextClass}`}
          >
            {formatChipWithSuffix(player.stack)}
          </div>
        </div>
      </div>

      {/* 中段+下段 */}
      <div className="relative flex flex-col overflow-hidden">
        {/* 中段: 青背景でプレイヤー名 */}
        <div
          className="flex rounded-t-sm border-2 border-white bg-[#336699]"
          style={{ height: middleBarHeight }}
        >
          <div
            className={`flex flex-[2] items-center justify-center rounded-l-sm border-white border-r-2 px-2 text-white ${nameTextClass}`}
          >
            <span className="truncate uppercase">
              {player.name}
              {isWinner && (
                <img
                  alt="winner"
                  className={`ml-1 inline ${winnerIconClass}`}
                  src={CheckMarkSvg}
                />
              )}
            </span>
          </div>
        </div>

        {/* 下段: 黒背景でアクション情報 */}
        <div
          className={`flex items-center justify-center rounded-b-sm border-2 border-white border-t-0 bg-black text-white uppercase ${actionTextClass}`}
          style={{
            height: lowerBarHeight,
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          {actionDisplay || "-"}
        </div>
      </div>
    </div>
  );
}
