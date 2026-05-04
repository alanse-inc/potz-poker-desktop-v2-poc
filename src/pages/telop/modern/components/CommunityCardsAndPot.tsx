import { formatChipWithSuffix } from "../../../../features/chip/format_chip_with_suffix";
import type { Card, TexasHoldemBoard } from "../../../../types";
import { TelopFaceCard, TelopReverseCard } from "../../components/TelopCard";
import { getTotalPot } from "../../utils";

type Props = {
  board: TexasHoldemBoard;
};

/**
 * Modern テーマ コミュニティカード + ポット表示
 * FuturaPT フォント、白背景のPOT表示
 */
export function ModernCommunityCardsAndPot({ board }: Props) {
  const communityCards: (Card | null)[] = [
    ...board.communityCards,
    ...Array(5 - board.communityCards.length).fill(null),
  ];
  const totalPot = getTotalPot(board);

  return (
    <div
      className="relative flex flex-col"
      style={{ fontFamily: "FuturaCyrillicHeavy" }}
    >
      {/* 上段: コミュニティカード5枚 (slot-0〜slot-4 の固定スロット) */}
      <div className="flex w-full justify-between gap-0.5">
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

      {/* 下段: POT（白背景） + Hand#（黒背景） */}
      <div className="flex w-full flex-col">
        <div className="flex w-full items-center justify-center rounded-t-sm bg-white p-0.5">
          <p className="flex gap-6 font-extrabold text-2xl text-black">
            <span>POT</span>
            <span>{formatChipWithSuffix(totalPot)}</span>
          </p>
        </div>
        <div className="flex w-full items-center justify-center rounded-b-sm bg-black py-0.5">
          <p className="font-extrabold text-base text-white">
            Hand #{board.handNumber}
          </p>
        </div>
      </div>
    </div>
  );
}
