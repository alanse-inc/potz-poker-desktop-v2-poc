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

export function BasicAutoCommunityCards({
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
    <div ref={containerRef} className="relative flex w-fit flex-col items-end">
      {onScaleChange && (
        <ResizeHandles onMouseDown={handleResizeStart} visible={true} />
      )}
      <div
        className="flex w-[230px] flex-col items-center gap-1.5 rounded-lg border-2 border-[#D0D5DD] p-2"
        style={{
          background:
            "linear-gradient(225deg, rgba(68, 68, 68, 1) 0%, rgba(0, 0, 0, 1) 100%)",
          boxShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div className="flex w-full gap-1.5">
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
          <div className="w-full text-sm text-white">
            <p>{gameName}</p>
          </div>
        )}
      </div>
    </div>
  );
}
