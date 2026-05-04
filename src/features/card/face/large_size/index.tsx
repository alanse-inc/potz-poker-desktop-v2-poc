import type { Card as CardDomain } from "../../../../types";
import { suitSvgMap, valueSvgMap } from "../svg/maps";

type LargeCardProps = {
  card: CardDomain;
  className?: string;
  onClick?: () => void;
};

/**
 * トランプの表面を表示するコンポーネント(大サイズ)
 */
export function LargeCard(props: LargeCardProps) {
  const handleInteraction = () => {
    props.onClick?.();
  };

  return (
    <button
      type="button"
      className={`${props.className} flex h-24 w-18 flex-col items-center justify-center gap-3 rounded-md bg-white px-3 py-2`}
      onClick={handleInteraction}
    >
      <div className="h-8 w-auto">
        <img
          className="pointer-events-none h-full w-full"
          src={valueSvgMap[props.card.value]}
          alt={`Value ${props.card.value}`}
        />
      </div>
      <div className="h-8 w-auto">
        <img
          className="pointer-events-none h-full w-full"
          src={suitSvgMap[props.card.suit]}
          alt={`Suit ${props.card.suit}`}
        />
      </div>
    </button>
  );
}
