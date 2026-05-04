/**
 * Auto Game Setting - プレイヤーカード
 */

import { displayPosition } from "../../../../domain/auto_game/player";
import type { AutoModePlayer } from "../../../../domain/auto_game/types";
import { PlayerIcon } from "../../../../features/player/player_icon";

type Props = {
  player: AutoModePlayer;
  onClick: () => void;
};

export function SettingPlayerCard({ player, onClick }: Props) {
  return (
    <button
      className="relative flex cursor-pointer flex-col items-center justify-center p-2"
      onClick={onClick}
      type="button"
    >
      <div className="w-45">
        <div className="flex h-18 flex-col items-start justify-start rounded-t-xl border-white border-x-3 border-t-3 bg-gray-900 px-3 pt-1 text-white text-xs">
          <div className="font-bold">{player.name || "NO NAME"}</div>
          <div>{displayPosition(player.position)}</div>
        </div>
        <div className="h-7 rounded-b-xl border-3 border-white bg-white px-3 text-left font-bold text-gray-900 text-xs" />
        <div className="absolute top-[16px] right-[-20px]">
          <PlayerIcon
            bgColor="gray"
            playerIcon={player.icon ?? null}
            size="medium"
          />
        </div>
      </div>
    </button>
  );
}
