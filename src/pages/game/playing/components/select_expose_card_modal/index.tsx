import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../../../../api/client";
import { SmallCard } from "../../../../../features/card/face/small_size";
import type { Card, Suit } from "../../../../../types";
import { RoundButton } from "../../../../../ui/button/round_button";

type Props = {
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

const ALL_VALUES = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
] as const;

function isSameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.value === b.value;
}

/** カードを一意に識別する文字列キーを返す */
function cardKey(card: Card): string {
  return `${card.suit}-${card.value}`;
}

/** 全52枚のカードを生成する */
function allCards(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const value of ALL_VALUES) {
      cards.push({ suit, value });
    }
  }
  return cards;
}

export function SelectExposeCardModal({ onClose, onConfirmed }: Props) {
  const [selected, setSelected] = useState<Card | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** 残デッキのカードキー Set。null は未ロード状態（全カード選択可能として扱う） */
  const [remainingKeys, setRemainingKeys] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function fetchDeck() {
      api.board
        .getRemainingDeck()
        .then((remaining) => {
          if (!cancelled) {
            setRemainingKeys(new Set(remaining.map(cardKey)));
          }
        })
        .catch((err: unknown) => {
          console.error("[SelectExposeCardModal] getRemainingDeck failed", err);
        });
    }

    fetchDeck();

    let unlisten: (() => void) | undefined;
    api.notifications
      .onBoardUpdated(() => {
        fetchDeck();
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const cards = allCards();

  const handleConfirm = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    try {
      await api.action.expose(selected);
      onConfirmed();
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Expose に失敗しました";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[80vh] w-[480px] flex-col gap-4 overflow-hidden rounded-xl bg-gray-900 p-6">
        <h2 className="text-center font-bold text-white text-xl">
          Expose カードを選択
        </h2>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {SUITS.map((suit) => {
            const suitCards = cards.filter((c) => c.suit === suit);
            return (
              <div key={suit} className="flex flex-col gap-2">
                <p className="font-bold text-gray-400 text-sm">
                  {SUIT_LABEL[suit]}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suitCards.map((card) => {
                    const isSelected =
                      selected !== null && isSameCard(card, selected);
                    /** 残デッキがロード済みで、かつこのカードが含まれていない場合は使用済み */
                    const isUsed =
                      remainingKeys !== null &&
                      !remainingKeys.has(cardKey(card));
                    return (
                      <div
                        key={`${card.suit}-${card.value}`}
                        className={`rounded transition-all duration-75 ${
                          isUsed
                            ? "cursor-not-allowed opacity-25"
                            : isSelected
                              ? "scale-110 ring-2 ring-primary"
                              : "opacity-80 hover:opacity-100"
                        }`}
                      >
                        <SmallCard
                          card={card}
                          onClick={
                            isUsed
                              ? undefined
                              : () => setSelected(isSelected ? null : card)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
