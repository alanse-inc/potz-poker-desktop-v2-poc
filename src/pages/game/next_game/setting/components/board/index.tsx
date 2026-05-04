import { produce } from "immer";
import type { PlayerSeatRange } from "../../../../../../contexts/initialize_board_command_context";
import type { TexasHoldemPosition } from "../../../../../../domain/auto_game/types";
import {
  Board,
  type BoardProps,
  type SeatContent,
} from "../../../../../../features/board";
import { DealerIcon } from "../../../../../../features/dealer_icon";
import { CircleButton } from "../../../../../../ui/button/circle_button";
import { RoundButton } from "../../../../../../ui/button/round_button";
import { PlayerCard } from "../player_card";

type Player = {
  name: string;
  stack: number;
  status: "active" | "leaved" | "bust";
  position: TexasHoldemPosition | null;
  seat: PlayerSeatRange;
  icon?: string | null;
};

type Props = {
  players: Player[];
  gameName: string;
  onClickSeat: (seat: PlayerSeatRange) => void;
  onNavigateToCheckIn?: () => void;
};

const ALL_SEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function SettingBoard({
  players,
  gameName,
  onClickSeat,
  onNavigateToCheckIn,
}: Props) {
  const initialSeats: BoardProps["seats"] = ALL_SEATS.reduce(
    (acc, seat) => {
      acc[seat] = {
        playerCard: (
          <CircleButton
            key={seat}
            text="+"
            size="medium"
            onClick={() => onClickSeat(seat)}
          />
        ),
      };
      return acc;
    },
    {} as BoardProps["seats"],
  );

  const seats = produce(initialSeats, (draftSeats) => {
    for (const player of players) {
      const seatContent: SeatContent = {
        playerCard: (
          <PlayerCard
            key={player.seat}
            player={player}
            onClick={() => onClickSeat(player.seat)}
          />
        ),
        otherItem:
          player.position === "btn" || player.position === "btn_sb" ? (
            <DealerIcon />
          ) : undefined,
      };
      draftSeats[player.seat] = seatContent;
    }
  });

  const centerContent = (
    <div className="flex flex-col items-center gap-4">
      {onNavigateToCheckIn && (
        <RoundButton
          type="black"
          text="CHECK-IN"
          size="auto"
          onClick={onNavigateToCheckIn}
        />
      )}
      <p className="font-bold text-sm text-white">{gameName}</p>
    </div>
  );

  return <Board seats={seats} centerContent={centerContent} />;
}
