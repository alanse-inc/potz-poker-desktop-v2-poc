import type { Card as CardDomain } from "../../../../types";
import { suitSvgMap, valueSvgMap } from "../svg/maps";

type SmallCardProps = {
  card: CardDomain;
  className?: string;
  onClick?: () => void;
};

/**
 * トランプの表面を表示するコンポーネント(小サイズ)
 */
export function SmallCard(props: SmallCardProps) {
  return (
    <button
      type="button"
      className={`${props.className} flex h-[51px] w-[34px] flex-col items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 ${props.onClick ? "cursor-pointer" : ""}`}
      onClick={props.onClick}
    >
      <div className="h-4 w-4">
        <img
          className="pointer-events-none h-full w-full"
          src={valueSvgMap[props.card.value]}
          alt={`Value ${props.card.value}`}
        />
      </div>
      <div className="h-4 w-4">
        <img
          className="pointer-events-none h-full w-full"
          src={suitSvgMap[props.card.suit]}
          alt={`Suit ${props.card.suit}`}
        />
      </div>
    </button>
  );
}
