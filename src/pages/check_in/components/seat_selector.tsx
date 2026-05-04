import { produce } from "immer";
import { useMemo } from "react";
import type { PlayerSeatRange } from "../../../contexts/initialize_board_command_context";
import {
  Board,
  type BoardProps,
  type SeatContent,
} from "../../../features/board";
import { CircleButton } from "../../../ui/button/circle_button";

type Props = {
  selectedSeat: PlayerSeatRange | null;
  occupiedSeats?: PlayerSeatRange[];
  onSelectSeat: (seat: PlayerSeatRange) => void;
};

export function SeatSelector({
  selectedSeat,
  occupiedSeats = [],
  onSelectSeat,
}: Props) {
  const allSeats: PlayerSeatRange[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const seats: BoardProps["seats"] = useMemo(() => {
    return produce({} as BoardProps["seats"], (draft) => {
      for (const seatNumber of allSeats) {
        const isOccupied = occupiedSeats.includes(seatNumber);
        const isSelected = selectedSeat === seatNumber;

        const buttonContent = isSelected
          ? "✓"
          : isOccupied
            ? "×"
            : String(seatNumber);

        const seatContent: SeatContent = {
          playerCard: (
            <CircleButton
              text={buttonContent}
              size="medium"
              onClick={() => !isOccupied && onSelectSeat(seatNumber)}
              disabled={isOccupied}
              className={isSelected ? "bg-primary text-white" : ""}
            />
          ),
        };

        draft[seatNumber] = seatContent;
      }
    });
  }, [selectedSeat, occupiedSeats, onSelectSeat]);

  const centerContent = (
    <div className="flex flex-col items-center gap-2">
      <p className="font-bold text-sm text-white">座席を選択</p>
      {selectedSeat && (
        <p className="text-gray-300 text-xs">座席 {selectedSeat} を選択中</p>
      )}
    </div>
  );

  return <Board seats={seats} centerContent={centerContent} />;
}
