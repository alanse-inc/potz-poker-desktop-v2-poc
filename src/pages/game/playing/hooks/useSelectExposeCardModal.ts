import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../../../../api/client";
import {
  trackClientSideError,
  trackError,
} from "../../../../features/error_tracker";
import type { Card, Suit, TexasHoldemBoard } from "../../../../types";

export type SelectExposeCardModalProps = {
  isOpen: boolean;
  usedCards: Card[];
  onOpenClick: () => void;
  onCardSelect: (suit: Suit, value: Card["value"]) => Promise<void>;
  onCancel: () => void;
};

export function useSelectExposeCardModal(
  board: TexasHoldemBoard | null,
): SelectExposeCardModalProps {
  const [isOpen, setIsOpen] = useState(false);
  const isProcessingRef = useRef(false);

  const allPlayerCards = useMemo<Card[]>(() => {
    if (!board) return [];
    return board.players.flatMap((p) => p.hand ?? []);
  }, [board]);

  const usedCards = useMemo<Card[]>(() => {
    if (!board) return [];
    return [...allPlayerCards, ...board.communityCards];
  }, [board, allPlayerCards]);

  const onOpenClick = useCallback(() => setIsOpen(true), []);

  const onCardSelect = useCallback(
    async (suit: Suit, value: Card["value"]) => {
      if (isProcessingRef.current) return;

      const isUsedCard = usedCards.some(
        (card) => card.suit === suit && card.value === value,
      );

      if (!board) {
        trackClientSideError("ボードが存在しません");
        return;
      }

      if (!isUsedCard) {
        trackClientSideError("選択できないカードです");
        return;
      }

      if (board.phase === "showdown") {
        trackClientSideError("アクション可能なボードではありません");
        return;
      }

      isProcessingRef.current = true;
      try {
        await api.action.expose({ suit, value });
        setIsOpen(false);
      } catch (e) {
        trackError({ type: "game_action_error", message: String(e) });
      } finally {
        isProcessingRef.current = false;
      }
    },
    [board, usedCards],
  );

  const onCancel = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    usedCards,
    onOpenClick,
    onCardSelect,
    onCancel,
  };
}
