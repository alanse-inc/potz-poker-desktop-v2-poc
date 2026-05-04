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

export function ClassicAutoCommunityCards({
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

  const borderRadius = 4;

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center gap-1.5 p-2"
      style={{ fontFamily: "Oswald" }}
    >
      {onScaleChange && (
        <ResizeHandles onMouseDown={handleResizeStart} visible={true} />
      )}
      <div className="flex w-full justify-between gap-1.5">
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
        <div
          className="flex w-full items-center justify-center border-2 border-white bg-[#336699] px-4 py-1"
          style={{ borderRadius }}
        >
          <p className="font-bold text-base text-white uppercase tracking-wider">
            {gameName}
          </p>
        </div>
      )}
    </div>
  );
}
