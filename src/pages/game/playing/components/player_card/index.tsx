import React from "react";
import { SmallReverseCard } from "../../../../../features/card/reverse/small_size";
import { formatChipWithSuffix } from "../../../../../features/chip/format_chip_with_suffix";
import { PlayerIcon } from "../../../../../features/player/player_icon";
import type { Player } from "../../../../../types";

type Props = {
  player: Player;
  isCurrentTurn: boolean;
  disabled: boolean;
  highlight: boolean;
  onPress?: () => void;
};

export function PlayerCard({
  player,
  isCurrentTurn,
  disabled,
  highlight,
  onPress,
}: Props) {
  const handleClick = React.useCallback(() => {
    onPress?.();
  }, [onPress]);

  // アクションバッジの表示テキストとカラーを返す
  const getDisplayAction = (): {
    text: string;
    bgClass: string;
    textClass: string;
  } => {
    if (player.hasFolded) {
      return {
        text: "FOLD",
        bgClass: "bg-action-badge-fold",
        textClass: "text-white",
      };
    }
    if (player.isAllIn) {
      return {
        text: "ALLIN",
        bgClass: "bg-action-badge-allin",
        textClass: "text-black",
      };
    }
    if (player.betInRound > 0) {
      return {
        text: formatChipWithSuffix(player.betInRound),
        bgClass: "bg-white",
        textClass: "text-gray-900",
      };
    }
    return { text: "", bgClass: "bg-white", textClass: "text-gray-900" };
  };

  const display = getDisplayAction();
  const borderColorClass = highlight ? "border-primary" : "border-white";

  return (
    <button
      className={`relative flex flex-col items-center justify-center p-2 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      onClick={handleClick}
      type="button"
    >
      <div className="w-45">
        {/* プレイヤー情報 */}
        <div
          className={`flex h-18 flex-col items-start justify-start rounded-t-xl border-x-3 border-t-3 bg-gray-900 px-3 pt-1 font-bold text-white text-xs ${
            highlight ? "border-primary" : "border-gray-800"
          }`}
        >
          <div>{player.name || "NO NAME"}</div>
          <div>{formatChipWithSuffix(player.stack)}</div>
          <div aria-hidden="true">{isCurrentTurn ? "▶" : ""}</div>
        </div>
        {/* アクションバッジ */}
        <div
          className={`h-7 rounded-b-xl border-3 px-3 text-left font-bold text-xs ${display.bgClass} ${display.textClass} ${borderColorClass}`}
        >
          {display.text}
        </div>
        {/* カード */}
        <div className="absolute top-[60px] right-[-5px] z-1 flex flex-row">
          <div className="translate-x-1 rotate-[-15deg] transform">
            <SmallReverseCard
              className={player.hand ? "" : "brightness-50 filter"}
            />
          </div>
          <div className="rotate-[15deg] transform">
            <SmallReverseCard
              className={player.hand ? "" : "brightness-50 filter"}
            />
          </div>
        </div>
        {/* プレイヤーアイコン */}
        <div className="absolute top-[16px] right-[-20px]">
          <PlayerIcon
            bgColor="gray"
            playerIcon={null}
            highlight={highlight}
            size="medium"
          />
        </div>
      </div>
    </button>
  );
}
