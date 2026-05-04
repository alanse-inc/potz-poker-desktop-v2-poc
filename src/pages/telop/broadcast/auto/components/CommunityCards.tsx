import type { Card } from "../../../../../types";
import type { PlayerCardSize } from "../../../auto_types";
import { ResizeHandles } from "../../../components/ResizeHandles";
import { TelopFaceCard, TelopReverseCard } from "../../../components/TelopCard";
import { useCommunityCardDisplay } from "../../../hooks/useCommunityCardDisplay";
import { useResizeHandle } from "../../../hooks/useResizeHandle";

type Props = {
  communityCards?: Card[];
  gameName?: string | null;
  scale?: number;
  onScaleChange?: (newScale: number) => void;
  size?: PlayerCardSize;
};

export function BroadcastAutoCommunityCards({
  communityCards,
  gameName,
  scale = 1,
  onScaleChange,
  size = "small",
}: Props) {
  const { containerRef, handleResizeStart } = useResizeHandle({
    onScaleChange,
    currentScale: scale,
  });
  const { shouldShowSlots } = useCommunityCardDisplay(communityCards);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center"
      style={{ fontFamily: "Montserrat", fontStyle: "italic" }}
    >
      {onScaleChange && (
        <ResizeHandles onMouseDown={handleResizeStart} visible={true} />
      )}
      <div className="flex w-full justify-between gap-2">
        {(["flop1", "flop2", "flop3", "turn", "river"] as const).map(
          (slot, index) => {
            const shouldShow = shouldShowSlots[index];
            const card = communityCards?.[index];

            return shouldShow && card ? (
              <TelopFaceCard key={slot} card={card} size={size} />
            ) : (
              <TelopReverseCard key={slot} size={size} />
            );
          },
        )}
      </div>
      {gameName && (
        <div className="mt-1 flex w-full items-center justify-center rounded-xs bg-white px-4 py-1">
          <span className="font-bold text-2xl text-black">{gameName}</span>
        </div>
      )}
    </div>
  );
}
