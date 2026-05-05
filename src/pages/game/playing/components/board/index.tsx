import { produce } from "immer";
import {
  Board,
  type BoardProps,
  type SeatContent,
} from "../../../../../features/board";
import { DealerIcon } from "../../../../../features/dealer_icon";
import type { TexasHoldemBoard } from "../../../../../types";
import { CommunityCardsAndPot } from "../community_cards_and_pot";
import { PlayerCard } from "../player_card";

type Props = {
  board: TexasHoldemBoard;
  centerText?: string;
  clickableLocateNumbers: number[];
  onPlayerCardPress: (position: number) => void;
  onEditCommunityCard: (locateNumber: number) => void;
};

// position は 0-indexed (0..n-1)。10人席 (1..10) に対応付ける。
// position 0 → seat 1, ..., position 9 → seat 10
function positionToSeat(position: number): number {
  return position + 1;
}

export function PlayingBoard({
  board,
  onPlayerCardPress,
  onEditCommunityCard,
  centerText,
  clickableLocateNumbers,
}: Props) {
  // BoardProps["seats"]の初期化
  const initialSeats: BoardProps["seats"] = {
    1: { playerCard: undefined },
    2: { playerCard: undefined },
    3: { playerCard: undefined },
    4: { playerCard: undefined },
    5: { playerCard: undefined },
    6: { playerCard: undefined },
    7: { playerCard: undefined },
    8: { playerCard: undefined },
    9: { playerCard: undefined },
    10: { playerCard: undefined },
  };

  const seats = produce(initialSeats, (draftSeats) => {
    for (const player of [...board.players]) {
      const isCurrentTurn = player.position === board.currentTurn;
      const isShowdown = board.phase === "showdown";

      const isDisabled = player.hasFolded || (isShowdown && !isCurrentTurn);
      const isHighlight = isCurrentTurn;

      const playerCardElement = (
        <PlayerCard
          key={player.position}
          player={player}
          isCurrentTurn={isCurrentTurn}
          disabled={isDisabled}
          highlight={isHighlight}
          onPress={() => onPlayerCardPress(player.position)}
        />
      );

      const seatContent: SeatContent = {
        playerCard: playerCardElement,
        otherItem:
          player.position === board.dealerPosition ? <DealerIcon /> : undefined,
      };

      if (player.betInRound > 0) {
        seatContent.chips = player.betInRound;
      }

      const seat = positionToSeat(player.position) as
        | 1
        | 2
        | 3
        | 4
        | 5
        | 6
        | 7
        | 8
        | 9
        | 10;
      draftSeats[seat] = seatContent;
    }
  });

  // 中央のコミュニティカードとポットを表示
  const centerContent = (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`text-base text-red-500 ${centerText ? "" : "invisible"}`}
      >
        {centerText ?? " "}
      </div>
      <CommunityCardsAndPot
        communityCards={board.communityCards}
        pots={board.pots}
        clickableLocateNumbers={clickableLocateNumbers}
        onEditCommunityCard={onEditCommunityCard}
      />
    </div>
  );

  return <Board seats={seats} centerContent={centerContent} />;
}
