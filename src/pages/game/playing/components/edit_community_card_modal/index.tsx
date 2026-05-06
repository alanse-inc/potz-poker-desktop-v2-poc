import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../../../../api/client";
import { SmallCard } from "../../../../../features/card/face/small_size";
import type { Card, Suit } from "../../../../../types";
import { RoundButton } from "../../../../../ui/button/round_button";

type Props = {
  locateNumber: number;
  onClose: () => void;
  onConfirmed: () => void;
};

const SUITS: Suit[] = ["spade", "heart", "diamond", "club"];

const SUIT_LABEL: Record<Suit, string> = {
  spade: "Spade",
  heart: "Heart",
  diamond: "Diamond",
  club: "Club",
};

function isSameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.value === b.value;
}

export function EditCommunityCardModal({
  locateNumber,
  onClose,
  onConfirmed,
}: Props) {
  const [deck, setDeck] = useState<Card[]>([]);
  const [selected, setSelected] = useState<Card | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.board
      .getRemainingDeck()
      .then((cards) => {
        if (!cancelled) setDeck(cards);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : "残デッキの取得に失敗しました";
        toast.error(message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfirm = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    try {
      await api.board.editCommunityCard(locateNumber, selected);
      onConfirmed();
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "カードの設定に失敗しました";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[80vh] w-[480px] flex-col gap-4 overflow-hidden rounded-xl bg-gray-900 p-6">
        <h2 className="text-center font-bold text-white text-xl">
          コミュニティカードを選択 (スロット {locateNumber + 1})
        </h2>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {SUITS.map((suit) => {
            const cards = deck.filter((c) => c.suit === suit);
            if (cards.length === 0) return null;
            return (
              <div key={suit} className="flex flex-col gap-2">
                <p className="font-bold text-gray-400 text-sm">
                  {SUIT_LABEL[suit]}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cards.map((card) => {
                    const isSelected =
                      selected !== null && isSameCard(card, selected);
                    return (
                      <div
                        key={`${card.suit}-${card.value}`}
                        className={`rounded transition-all duration-75 ${
                          isSelected
                            ? "scale-110 ring-2 ring-primary"
                            : "opacity-80 hover:opacity-100"
                        }`}
                      >
                        <SmallCard
                          card={card}
                          onClick={() => setSelected(isSelected ? null : card)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {deck.length === 0 && (
            <p className="text-center text-gray-400">
              残デッキにカードがありません
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <RoundButton
            type="primary"
            size="full"
            text="決定"
            disabled={selected === null || isSubmitting}
            onClick={handleConfirm}
          />
          <RoundButton
            type="black"
            size="full"
            text="キャンセル"
            onClick={onClose}
          />
        </div>
      </div>
    </div>
  );
}
