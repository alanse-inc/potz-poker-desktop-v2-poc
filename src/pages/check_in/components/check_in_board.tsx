import { produce } from "immer";
import { useMemo } from "react";
import type { PlayerSeatRange } from "../../../contexts/initialize_board_command_context";
import {
  Board,
  type BoardProps,
  type SeatContent,
} from "../../../features/board";
import { CircleButton } from "../../../ui/button/circle_button";
import { type CheckInPlayer, CheckInPlayerCard } from "./check_in_player_card";

export type { CheckInPlayer };

type Props = {
  players: CheckInPlayer[];
  loadingSeat?: PlayerSeatRange | null;
  onSelectSeat: (seat: PlayerSeatRange) => void;
};

export function CheckInBoard({ players, loadingSeat, onSelectSeat }: Props) {
  const allSeats: PlayerSeatRange[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const playersBySeat = useMemo(() => {
    const map = new Map<PlayerSeatRange, CheckInPlayer>();
    for (const player of players) {
      map.set(player.seat, player);
    }
    return map;
  }, [players]);

  const seats: BoardProps["seats"] = useMemo(() => {
    return produce({} as BoardProps["seats"], (draft) => {
      for (const seatNumber of allSeats) {
        const player = playersBySeat.get(seatNumber);

        if (player) {
          const seatContent: SeatContent = {
            playerCard: <CheckInPlayerCard key={player.id} player={player} />,
          };
          draft[seatNumber] = seatContent;
        } else {
          const isLoading = loadingSeat === seatNumber;
          const seatContent: SeatContent = {
            playerCard: (
              <CircleButton
                text={isLoading ? "..." : "+"}
                size="medium"
                onClick={() => !isLoading && onSelectSeat(seatNumber)}
                disabled={isLoading}
              />
            ),
          };
          draft[seatNumber] = seatContent;
        }
      }
    });
  }, [playersBySeat, loadingSeat, onSelectSeat]);

  const centerContent = (
    <div className="flex flex-col items-center gap-2">
      <p className="font-bold text-sm text-white">座席を選択してください</p>
    </div>
  );

  return <Board seats={seats} centerContent={centerContent} />;
}
