import {
  Board,
  type BoardProps,
  type SeatContent,
} from "../../../../../features/board";
import { CircleButton } from "../../../../../ui/button/circle_button";

type Player = { name: string };

type Props = {
  players: (Player | null)[];
  onClickSeat: (index: number) => void;
};

const ALL_SEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function SettingBoard({ players, onClickSeat }: Props) {
  const seats = ALL_SEATS.reduce(
    (acc, seat) => {
      const index = seat - 1;
      const player = players[index];

      const seatContent: SeatContent = player
        ? {
            playerCard: (
              <button
                key={seat}
                type="button"
                className="relative flex cursor-pointer flex-col items-center justify-center p-2"
                onClick={() => onClickSeat(index)}
              >
                <div className="w-45">
                  <div className="flex h-18 flex-col items-start justify-start rounded-t-xl border-gray-600 border-x-3 border-t-3 bg-gray-900 px-3 pt-1 font-bold text-white text-xs">
                    <div>Seat {seat}</div>
                    <div>{player.name}</div>
                  </div>
                  <div className="h-7 rounded-b-xl border-3 border-white bg-white px-3 text-left font-bold text-gray-900 text-xs" />
                </div>
              </button>
            ),
          }
        : {
            playerCard: (
              <CircleButton
                key={seat}
                text="+"
                size="medium"
                onClick={() => onClickSeat(index)}
              />
            ),
          };

      acc[seat] = seatContent;
      return acc;
    },
    {} as BoardProps["seats"],
  );

  const centerContent = (
    <p className="font-bold text-sm text-white">GAME SETTING</p>
  );

  return <Board seats={seats} centerContent={centerContent} />;
}
