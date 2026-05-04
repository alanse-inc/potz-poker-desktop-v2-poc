import { formatChipWithSuffix } from "../../../../features/chip/format_chip_with_suffix";
import type { Card, TexasHoldemBoard } from "../../../../types";
import { TelopFaceCard, TelopReverseCard } from "../../components/TelopCard";
import { getTotalPot } from "../../utils";

type Props = {
  board: TexasHoldemBoard;
};

/**
 * Broadcast テーマ コミュニティカード + ポット表示
 * Montserrat italic フォント、赤背景(#BB251A)のPOT表示
 */
export function BroadcastCommunityCardsAndPot({ board }: Props) {
  const communityCards: (Card | null)[] = [
    ...board.communityCards,
    ...Array(5 - board.communityCards.length).fill(null),
  ];
  const totalPot = getTotalPot(board);

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ fontFamily: "Montserrat", fontStyle: "italic" }}
    >
      {/* カード (slot-0〜slot-4 の固定スロット) */}
      <div className="flex w-full justify-between gap-2">
        {(["slot-0", "slot-1", "slot-2", "slot-3", "slot-4"] as const).map(
          (slotKey, slotIndex) => {
            const card = communityCards[slotIndex];
            return card ? (
              <TelopFaceCard key={slotKey} card={card} size="small" />
            ) : (
              <TelopReverseCard key={slotKey} size="small" />
            );
          },
        )}
      </div>

      {/* ポット（赤背景） */}
      <div
        className="mt-2 flex w-full items-center justify-center rounded-xs px-4 py-1.5"
        style={{ backgroundColor: "#BB251A" }}
      >
        <span className="mr-4 font-bold text-2xl text-white">POT</span>
        <span className="font-bold text-2xl text-white">
          {formatChipWithSuffix(totalPot)}
        </span>
      </div>

      {/* Hand# */}
      <div className="mt-1 flex w-full items-center justify-center rounded-xs bg-white px-4 py-1">
        <span className="font-bold text-2xl text-black">
          Hand #{board.handNumber}
        </span>
      </div>
    </div>
  );
}
