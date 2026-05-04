/**
 * Auto Mode ボード UI コンポーネント
 *
 * Electron 版の features/auto_mode_board/index.tsx を移植
 */

import type { ReactNode } from "react";
import React from "react";
import { getOtherItemStyle, getSeatPosition } from "../../constants/positions";

const seatIndices = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type SeatContent = {
  player?: ReactNode;
  otherItem?: ReactNode;
};

export type BoardProps = {
  seats: {
    1: SeatContent;
    2: SeatContent;
    3: SeatContent;
    4: SeatContent;
    5: SeatContent;
    6: SeatContent;
    7: SeatContent;
    8: SeatContent;
    9: SeatContent;
  };
  centerContent?: ReactNode;
};

export function AutoModeBoard({ seats, centerContent }: BoardProps) {
  return (
    <div className="relative h-[320px] w-[520px] rounded-full bg-[#24272C] shadow-custom">
      {centerContent && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-lg text-white">
          {centerContent}
        </div>
      )}

      {seatIndices.map((seatIndex) => {
        const seat = seats[seatIndex];

        return (
          <React.Fragment key={`seat-${seatIndex}`}>
            <div style={getSeatPosition(seatIndex)}>{seat.player}</div>
            <div className="flex gap-1" style={getOtherItemStyle(seatIndex)}>
              {seat.otherItem}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
