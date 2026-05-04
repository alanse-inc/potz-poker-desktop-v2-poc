import { match } from "ts-pattern";
import type {
  ManualPlayerStatus,
  PlayerSeatRange,
} from "../../../contexts/initialize_board_command_context";
import type { TexasHoldemPosition } from "../../../domain/auto_game/types";
import { formatChipWithSuffix } from "../../../features/chip/format_chip_with_suffix";
import { PlayerIcon } from "../../../features/player/player_icon";

export type CheckInPlayer = {
  id: string;
  name: string;
  icon?: string;
  status: ManualPlayerStatus;
  stack: number;
  position: TexasHoldemPosition | null;
  seat: PlayerSeatRange;
};

type Props = {
  player: CheckInPlayer;
};

function statusText(status: ManualPlayerStatus): string {
  return match(status)
    .with("leaved", () => "離席中")
    .with("bust", () => "BUST")
    .otherwise(() => "");
}

function getDisplayPosition(
  position: TexasHoldemPosition | null | undefined,
): string {
  return match(position)
    .with("btn", () => "BTN")
    .with("btn_sb", () => "BTN／SB")
    .with("bb", () => "BB")
    .with("sb", () => "SB")
    .with("utg", () => "UTG")
    .with("utg_plus_1", () => "+1")
    .with("utg_plus_2", () => "+2")
    .with("utg_plus_3", () => "+3")
    .with("mp", () => "MP")
    .with("hj", () => "HJ")
    .with("co", () => "CO")
    .with(null, () => "")
    .with(undefined, () => "")
    .otherwise(() => "");
}

export function CheckInPlayerCard({ player }: Props) {
  const isOpacity = player.status === "leaved" || player.status === "bust";

  return (
    <div
      className={`relative flex flex-col items-center justify-center p-2 ${isOpacity ? "opacity-50" : ""}`}
    >
      <div className="w-45">
        <div className="flex h-18 flex-col items-start justify-start rounded-t-xl border-x-3 border-t-3 bg-gray-900 px-3 pt-1 font-bold text-white text-xs">
          <div>{player.name || "NO NAME"}</div>
          <div>{formatChipWithSuffix(player.stack)}</div>
          <div>{getDisplayPosition(player.position)}</div>
        </div>
        <div className="h-7 rounded-b-xl border-3 border-white bg-white px-3 text-left font-bold text-gray-900 text-xs">
          {statusText(player.status)}
        </div>
        <div className="absolute top-[16px] right-[-20px]">
          <PlayerIcon
            bgColor="gray"
            playerIcon={player.icon ?? null}
            size="medium"
          />
        </div>
      </div>
    </div>
  );
}
