import { formatChipWithSuffix } from "../../../../features/chip/format_chip_with_suffix";
import type { Card, TexasHoldemBoard } from "../../../../types";
import { TelopFaceCard, TelopReverseCard } from "../../components/TelopCard";
import { getTotalPot } from "../../utils";

type Props = {
  board: TexasHoldemBoard;
};

/**
 * Classic テーマ コミュニティカード + ポット表示
 * Oswald フォント、青背景（#336699）のPOT表示
 */
export function ClassicCommunityCardsAndPot({ board }: Props) {
  const communityCards: (Card | null)[] = [
    ...board.communityCards,
    ...Array(5 - board.communityCards.length).fill(null),
  ];
  const totalPot = getTotalPot(board);

  return (
    <div
      className="relative flex flex-col items-center gap-1.5 p-2"
      style={{ fontFamily: "Oswald" }}
    >
      {/* 上段: コミュニティカード5枚 (slot-0〜slot-4 の固定スロット) */}
      <div className="flex w-full justify-between gap-1.5">
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

      {/* 下段: POT + Hand# */}
      <div className="flex w-full flex-col overflow-hidden rounded-sm">
        {/* POT表示 - 青背景 */}
        <div className="flex w-full items-center justify-center rounded-t-sm border-2 border-white bg-[#336699] px-4 py-2">
          <p className="font-bold text-2xl text-white tracking-wide">
            <span className="mr-4">POT</span>
            <span>{formatChipWithSuffix(totalPot)}</span>
          </p>
        </div>
        {/* ゲーム名/Hand# - 白背景 */}
        <div className="flex w-full items-center justify-center border-2 border-white border-t-0 bg-white px-4 py-1">
          <p className="font-bold text-base text-black uppercase tracking-wider">
            Hand #{board.handNumber}
          </p>
        </div>
      </div>
    </div>
  );
}
