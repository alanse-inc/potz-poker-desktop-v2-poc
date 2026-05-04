/**
 * Auto Game Setting - ボード (シート選択 UI)
 */

import { produce } from "immer";
import type { AutoModePlayer } from "../../../../domain/auto_game/types";
import {
  AutoModeBoard,
  type BoardProps,
  type SeatContent,
} from "../../../../features/auto_mode_board";
import { DealerIcon } from "../../../../features/dealer_icon";
import { CircleButton } from "../../../../ui/button/circle_button";
import { SettingPlayerCard } from "./player_card";

type Props = {
  players: AutoModePlayer[];
  gameName: string;
  onClickSeat: (seat: number) => void;
};

export function SettingBoard({ players, gameName, onClickSeat }: Props) {
  const initialSeats: BoardProps["seats"] = {
    1: {
      player: (
        <CircleButton text="+" size="medium" onClick={() => onClickSeat(1)} />
      ),
    },
    2: {
      player: (
        <CircleButton text="+" size="medium" onClick={() => onClickSeat(2)} />
      ),
    },
    3: {
      player: (
        <CircleButton text="+" size="medium" onClick={() => onClickSeat(3)} />
      ),
    },
    4: {
      player: (
        <CircleButton text="+" size="medium" onClick={() => onClickSeat(4)} />
      ),
    },
    5: {
      player: (
        <CircleButton text="+" size="medium" onClick={() => onClickSeat(5)} />
      ),
    },
    6: {
      player: (
        <CircleButton text="+" size="medium" onClick={() => onClickSeat(6)} />
      ),
    },
    7: {
      player: (
        <CircleButton text="+" size="medium" onClick={() => onClickSeat(7)} />
      ),
    },
    8: {
      player: (
        <CircleButton text="+" size="medium" onClick={() => onClickSeat(8)} />
      ),
    },
    9: {
      player: (
        <CircleButton text="+" size="medium" onClick={() => onClickSeat(9)} />
      ),
    },
  };

  const seats = produce(initialSeats, (draft) => {
    for (const player of players) {
      const seat = player.seat as keyof BoardProps["seats"];
      const seatContent: SeatContent = {
        player: (
          <SettingPlayerCard
            key={player.id}
            player={player}
            onClick={() => onClickSeat(player.seat)}
          />
        ),
        otherItem:
          player.position === "btn" || player.position === "btn_sb" ? (
            <DealerIcon />
          ) : undefined,
      };
      draft[seat] = seatContent;
    }
  });

  const centerContent = (
    <p className="font-bold text-sm text-white">{gameName}</p>
  );

  return <AutoModeBoard seats={seats} centerContent={centerContent} />;
}
