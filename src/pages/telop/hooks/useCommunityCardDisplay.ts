import { useMemo } from "react";
import type { Card } from "../../../types";

type UseCommunityCardDisplayResult = {
  shouldShowSlots: [boolean, boolean, boolean, boolean, boolean];
};

function shouldShowCommunityCard(
  communityCards: Card[] | undefined,
  index: number,
): boolean {
  if (!communityCards) return false;
  // フロップ(0-2)は3枚揃ったときのみ表示
  if (index <= 2) {
    return communityCards.length >= 3;
  }
  return communityCards.length > index;
}

export function useCommunityCardDisplay(
  communityCards: Card[] | undefined,
): UseCommunityCardDisplayResult {
  const shouldShowSlots = useMemo<
    [boolean, boolean, boolean, boolean, boolean]
  >(() => {
    return [
      shouldShowCommunityCard(communityCards, 0),
      shouldShowCommunityCard(communityCards, 1),
      shouldShowCommunityCard(communityCards, 2),
      shouldShowCommunityCard(communityCards, 3),
      shouldShowCommunityCard(communityCards, 4),
    ];
  }, [communityCards]);

  return { shouldShowSlots };
}
