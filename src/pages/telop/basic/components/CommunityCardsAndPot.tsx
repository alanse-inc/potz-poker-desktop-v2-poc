import { formatChipWithSuffix } from "../../../../features/chip/format_chip_with_suffix";
import type { Card, TexasHoldemBoard } from "../../../../types";
import { TelopFaceCard, TelopReverseCard } from "../../components/TelopCard";
import { getTotalPot } from "../../utils";

type Props = {
  board: TexasHoldemBoard;
};

/**
 * Basic テーマ コミュニティカード + ポット表示
 */
export function BasicCommunityCardsAndPot({ board }: Props) {
  const communityCards: (Card | null)[] = [
    ...board.communityCards,
    ...Array(5 - board.communityCards.length).fill(null),
  ];
  const totalPot = getTotalPot(board);

  return (
    <div className="flex w-fit flex-col items-end">
      <div
        className="flex w-[230px] flex-col items-center gap-1.5 rounded-lg border-2 border-[#D0D5DD] p-2"
        style={{
          background:
            "linear-gradient(225deg, rgba(68, 68, 68, 1) 0%, rgba(0, 0, 0, 1) 100%)",
          boxShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)",
        }}
      >
        {/* コミュニティカード (slot-0〜slot-4 の固定スロット) */}
        <div className="flex w-full gap-1.5">
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

        {/* ポット */}
        <div className="flex w-full flex-col">
          <div className="flex w-full justify-between font-bold text-white text-xl">
            <p>POT</p>
            <p>{formatChipWithSuffix(totalPot)}</p>
          </div>
          <div className="w-full text-sm text-white">
            <p>Hand #{board.handNumber}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
