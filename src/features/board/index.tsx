import type { ReactNode } from "react";
import React from "react";
import { getOtherItemStyle, getSeatPosition } from "../../constants/positions";
import { ChipIconWithValue } from "../chip/chip_icon_with_value";

const seatIndices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type SeatContent = {
  playerCard: ReactNode;
  chips?: number;
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
    10: SeatContent;
  };
  centerContent?: ReactNode;
};

export function Board({ seats, centerContent }: BoardProps) {
  return (
    <div className="relative h-[320px] w-[520px] rounded-full bg-[#24272C] shadow-custom">
      {/* 中央のコンテンツ表示（例：コミュニティカード＆ポット） */}
      {centerContent && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-lg text-white">
          {centerContent}
        </div>
      )}

      {/* 各シートの表示 */}
      {seatIndices.map((seatIndex) => {
        const seat = seats[seatIndex];
        if (!seat) return null;

        return (
          <React.Fragment key={`seat-${seatIndex}`}>
            {/* プレイヤーカード */}
            <div style={getSeatPosition(seatIndex)}>{seat.playerCard}</div>
            {/* その他表示すべきアイテム */}
            <div className="flex gap-1" style={getOtherItemStyle(seatIndex)}>
              {seat.otherItem && seat.otherItem}
              {seat.chips && <ChipIconWithValue value={seat.chips} />}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
