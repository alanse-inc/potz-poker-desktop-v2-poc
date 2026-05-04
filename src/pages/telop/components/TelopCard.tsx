import { suitSvgMap, valueSvgMap } from "../../../features/card/face/svg/maps";
import type { Card } from "../../../types";
import type { PlayerCardSize } from "../types";

type FaceCardProps = {
  card: Card;
  size?: PlayerCardSize;
};

/**
 * テロップ用 トランプ表面コンポーネント
 * small: 34x51px, large: 51x77px
 */
export function TelopFaceCard({ card, size = "small" }: FaceCardProps) {
  const style =
    size === "small"
      ? { width: "34px", height: "51px" }
      : { width: "51px", height: "77px" };

  const imgSize = size === "small" ? 20 : 30;

  const cardGradient =
    "linear-gradient(205.12deg, #FFFFFF 7.45%, #DADADA 74.19%, #717171 103.18%)";

  return (
    <div
      className="flex flex-col items-center justify-center rounded-sm"
      style={{ ...style, background: cardGradient, gap: "2px" }}
    >
      <img
        style={{ width: imgSize, height: imgSize }}
        src={valueSvgMap[card.value]}
        alt={`Value ${card.value}`}
      />
      <img
        style={{ width: imgSize, height: imgSize }}
        src={suitSvgMap[card.suit]}
        alt={`Suit ${card.suit}`}
      />
    </div>
  );
}

type ReverseCardProps = {
  size?: PlayerCardSize;
};

/**
 * テロップ用 トランプ裏面コンポーネント
 */
export function TelopReverseCard({ size = "small" }: ReverseCardProps) {
  const style =
    size === "small"
      ? { width: "34px", height: "51px" }
      : { width: "51px", height: "77px" };

  return (
    <div
      className="flex items-center justify-center rounded-sm"
      style={{
        ...style,
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        border: "1px solid rgba(255,255,255,0.2)",
      }}
    >
      <div
        className="rounded-sm"
        style={{
          width: "70%",
          height: "70%",
          background:
            "repeating-linear-gradient(45deg, #0f3460, #0f3460 2px, #1a1a2e 2px, #1a1a2e 8px)",
        }}
      />
    </div>
  );
}
