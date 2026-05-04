/**
 * Auto Game Playing - プレイヤーカード
 *
 * Electron 版の pages/auto_game/playing/components/player_card を移植
 */

import { displayPosition } from "../../../../domain/auto_game/player";
import type { AutoModePlayer } from "../../../../domain/auto_game/types";
import { SmallReverseCard } from "../../../../features/card/reverse/small_size";
import { PlayerIcon } from "../../../../features/player/player_icon";

type Props = {
  player: AutoModePlayer;
  onClick?: () => void;
};

export function PlayingPlayerCard({ player, onClick }: Props) {
  const isFolded = player.action === "fold";

  return (
    <button
      className={`relative flex cursor-pointer flex-col items-center justify-center p-2 ${isFolded ? "opacity-50" : ""}`}
      onClick={onClick}
      type="button"
    >
      <div className="w-45">
        <div className="flex h-18 flex-col items-start justify-start rounded-t-xl border-white border-x-3 border-t-3 bg-gray-900 px-3 pt-1 text-white text-xs">
          <div className="font-bold">{player.name || "NO NAME"}</div>
          <div>{displayPosition(player.position)}</div>
        </div>
        <div className="h-7 rounded-b-xl border-3 border-white bg-white px-3 text-left font-bold text-gray-900 text-xs" />

        {/* カード表示 */}
        <div className="absolute top-[60px] right-[-5px] z-1 flex flex-row">
          <div className="translate-x-1 rotate-[-15deg] transform">
            <SmallReverseCard
              className={player.hand[0] ? "" : "brightness-50 filter"}
            />
          </div>
          <div className="rotate-[15deg] transform">
            <SmallReverseCard
              className={player.hand[1] ? "" : "brightness-50 filter"}
            />
          </div>
        </div>

        {/* プレイヤーアイコン */}
        <div className="absolute top-[16px] right-[-20px]">
          <PlayerIcon bgColor="gray" playerIcon={player.icon} size="medium" />
        </div>
      </div>
    </button>
  );
}
