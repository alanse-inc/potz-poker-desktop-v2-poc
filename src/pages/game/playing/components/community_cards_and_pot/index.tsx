import { SmallCard } from "../../../../../features/card/face/small_size";
import { SmallReverseCard } from "../../../../../features/card/reverse/small_size";
import { formatChipWithSuffix } from "../../../../../features/chip/format_chip_with_suffix";
import type { Card, Pot } from "../../../../../types";

type Props = {
  communityCards: Card[];
  pots: Pot[];
  clickableLocateNumbers: number[];
  onEditCommunityCard: (locateNumber: number) => void;
};

/**
 * コミュニティカードとポットを表示するコンポーネント
 */
export function CommunityCardsAndPot({
  communityCards,
  pots,
  clickableLocateNumbers,
  onEditCommunityCard,
}: Props) {
  const totalPot = pots.reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className={"flex w-3xs flex-col items-center gap-1.5"}>
      {/* コミュニティカード */}
      <div className="flex w-full justify-center">
        <div className="flex justify-center gap-0.5">
          {[...Array(5)].map((_, index) => {
            const isClickable = clickableLocateNumbers.includes(index);
            return communityCards[index] ? (
              <SmallCard
                // index がスロット位置を表す（0=フロップ1枚目, 4=リバー）ため安全
                // biome-ignore lint/suspicious/noArrayIndexKey: stable slot index
                key={`community-card-${index}`}
                className={"cursor-not-allowed"}
                card={communityCards[index]}
              />
            ) : (
              <SmallReverseCard
                // biome-ignore lint/suspicious/noArrayIndexKey: stable slot index
                key={`reverse-card-${index}`}
                className={`filter ${
                  isClickable
                    ? "cursor-pointer"
                    : "cursor-not-allowed brightness-50"
                }`}
                onClick={() => {
                  if (isClickable) {
                    onEditCommunityCard(index);
                  }
                }}
              />
            );
          })}
        </div>
      </div>

      {/* メインポット */}
      <div className="flex w-full justify-center gap-6 font-bold text-lg text-white">
        <p>POT</p>
        <p>{formatChipWithSuffix(totalPot)}</p>
      </div>
    </div>
  );
}
