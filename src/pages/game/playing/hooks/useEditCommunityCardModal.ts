import { useCallback, useMemo, useState } from "react";
import { trackClientSideError } from "../../../../features/error_tracker";
import type { TexasHoldemBoard } from "../../../../types";

export type EditCommunityCardModalProps = {
  isOpen: boolean;
  clickableLocateNumbers: number[];
  onOpenClick: (locateNumber: number) => void;
  onCancel: () => void;
};

export function useEditCommunityCardModal(
  board: TexasHoldemBoard | null,
  isProcessing: boolean,
): EditCommunityCardModalProps {
  const [isOpen, setIsOpen] = useState(false);

  const clickableLocateNumbers = useMemo<number[]>(() => {
    if (!board || isProcessing) return [];
    if (board.phase === "showdown") return [];
    const next = board.communityCards.length;
    if (next < 5) return [next];
    return [];
  }, [board, isProcessing]);

  const onOpenClick = useCallback((locateNumber: number) => {
    if (
      !Number.isInteger(locateNumber) ||
      locateNumber < 0 ||
      locateNumber > 4
    ) {
      trackClientSideError("無効なロケート番号です");
      return;
    }
    setIsOpen(true);
  }, []);

  const onCancel = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    clickableLocateNumbers,
    onOpenClick,
    onCancel,
  };
}
