import { produce } from "immer";
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
  isDealer: boolean;
};

type Props = {
  players: (Player | null)[];
  onClickSeat: (index: number) => void;
  onNavigateToCheckIn?: () => void;
  gameName?: string;
};

const ALL_SEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function SettingBoard({
  players,
  onClickSeat,
  onNavigateToCheckIn,
  gameName = "FIRST GAME",
}: Props) {
  const initialSeats: BoardProps["seats"] = ALL_SEATS.reduce(
    (acc, seat) => {
      acc[seat] = {
        playerCard: (
          <CircleButton
            key={seat}
            text="+"
            size="medium"
            onClick={() => onClickSeat(seat - 1)}
          />
        ),
      };
      return acc;
    },
    {} as BoardProps["seats"],
  );

  const seats = produce(initialSeats, (draftSeats) => {
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      if (!player) continue;
      const seat = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      const seatContent: SeatContent = {
        playerCard: (
          <PlayerCard
            key={seat}
            seatIndex={i}
            name={player.name}
            stack={player.stack}
            onClick={() => onClickSeat(i)}
          />
        ),
        otherItem: player.isDealer ? <DealerIcon /> : undefined,
      };
      draftSeats[seat] = seatContent;
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
