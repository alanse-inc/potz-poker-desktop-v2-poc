import type { Card } from "../../../../../types";
import { ResizeHandles } from "../../../components/ResizeHandles";
import { TelopFaceCard, TelopReverseCard } from "../../../components/TelopCard";
import { useCommunityCardDisplay } from "../../../hooks/useCommunityCardDisplay";
import { useResizeHandle } from "../../../hooks/useResizeHandle";

type Props = {
  communityCards?: Card[];
  gameName?: string | null;
  scale?: number;
  onScaleChange?: (newScale: number) => void;
};

export function ModernAutoCommunityCards({
  communityCards,
  gameName,
  scale = 1,
  onScaleChange,
}: Props) {
  const { containerRef, handleResizeStart } = useResizeHandle({
    onScaleChange,
    currentScale: scale,
  });
  const { shouldShowSlots } = useCommunityCardDisplay(communityCards);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col"
      style={{ fontFamily: "'FuturaPT'" }}
    >
      {onScaleChange && (
        <ResizeHandles onMouseDown={handleResizeStart} visible={true} />
      )}
      <div className="flex w-full justify-between gap-0.5">
        {(["flop1", "flop2", "flop3", "turn", "river"] as const).map(
          (slot, index) => {
            const shouldShow = shouldShowSlots[index];
            const card = communityCards?.[index];

            return shouldShow && card ? (
              <TelopFaceCard key={slot} card={card} size="small" />
            ) : (
              <TelopReverseCard key={slot} size="small" />
            );
          },
        )}
      </div>
      {gameName && (
        <div className="mt-2 flex w-full items-center justify-center rounded-sm bg-black px-2 py-1.5">
          <p className="font-extrabold text-base text-white">{gameName}</p>
        </div>
      )}
    </div>
  );
}
