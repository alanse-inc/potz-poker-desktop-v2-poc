/**
 * Auto Game Playing - ボード
 *
 * Electron 版の pages/auto_game/playing/components/board を移植
 */

import { produce } from "immer";
import type { AutoModeBoard } from "../../../../domain/auto_game/types";
import {
  AutoModeBoard as AutoModeBoardUI,
  type BoardProps,
  type SeatContent,
} from "../../../../features/auto_mode_board";
import { DealerIcon } from "../../../../features/dealer_icon";
import { PlayingPlayerCard } from "./playing_player_card";

type Props = {
  board: AutoModeBoard;
  onPlayerCardPress: (playerId: string) => void;
};

export function PlayingBoard({ board, onPlayerCardPress }: Props) {
  const initialSeats: BoardProps["seats"] = {
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
    6: {},
    7: {},
    8: {},
    9: {},
  };

  const seats = produce(initialSeats, (draft) => {
    for (const player of board.players) {
      const seat = player.seat as keyof BoardProps["seats"];
      const seatContent: SeatContent = {
        player: (
          <PlayingPlayerCard
            key={player.id}
            player={player}
            onClick={() => onPlayerCardPress(player.id)}
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

  return <AutoModeBoardUI seats={seats} />;
}
