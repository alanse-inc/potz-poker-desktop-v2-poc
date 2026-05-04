import { match } from "ts-pattern";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../../../../domain/auto_game/types";
import { trackClientSideError } from "../../../../../features/error_tracker";
import type { PlayerCardSize, PlayerGroupSide } from "../../../auto_types";
import CheckMarkSvg from "../../../check_mark.svg";
import { TelopFaceCard, TelopReverseCard } from "../../../components/TelopCard";
import { useAutoPlayerDisplayHelpers } from "../../../hooks/useAutoPlayerDisplayHelpers";

type Props = {
  board: AutoModeBoard;
  player: AutoModePlayer;
  side: PlayerGroupSide;
  size?: PlayerCardSize;
  scale?: number;
};

export function BroadcastAutoPlayerCard({
  player,
  board,
  size = "small",
}: Props) {
  const { odds, isFolded, hand, position, isWinner } =
    useAutoPlayerDisplayHelpers({ player, board });

  if (!player) {
    trackClientSideError("BroadcastAutoPlayerCard: player is undefined");
    return null;
  }

  const containerClass = match(size)
    .with("small", () => "w-[242px]")
    .with("large", () => "w-[336px]")
    .exhaustive();

  const oddsSize = match(size)
    .with("small", () => ({ width: "98px", height: "32px" }))
    .with("large", () => ({ width: "128px", height: "42px" }))
    .exhaustive();

  const oddsClass = match(size)
    .with(
      "small",
      () =>
        "flex items-center justify-center rounded-xs bg-white text-2xl font-bold text-black",
    )
    .with(
      "large",
      () =>
        "flex items-center justify-center rounded-xs bg-white text-3xl font-bold text-black",
    )
    .exhaustive();

  const nameClass = match(size)
    .with("small", () => "text-xl font-bold")
    .with("large", () => "text-2xl font-bold")
    .exhaustive();

  const positionClass = match(size)
    .with("small", () => "text-lg font-bold uppercase")
    .with("large", () => "text-xl font-bold uppercase")
    .exhaustive();

  const winnerIconClass = match(size)
    .with("small", () => "ml-2 h-5 w-5")
    .with("large", () => "ml-3 h-6 w-6")
    .exhaustive();

  const cardGapClass = "gap-2";
  const cardContainerMarginClass = "mr-3";

  return (
    <div
      style={{ fontFamily: "Montserrat", fontStyle: "italic" }}
      className={`flex flex-col rounded-xl ${containerClass} ${isFolded ? "opacity-50" : ""}`}
      data-position={position}
      data-folded={isFolded ? "true" : "false"}
    >
      <div className="mb-2 flex items-end">
        <div className={`${cardContainerMarginClass} flex ${cardGapClass}`}>
          {[...Array(2)].map((_, index) => {
            const card = hand && index < hand.length ? hand[index] : null;
            return card ? (
              <TelopFaceCard
                key={`card-${index}-${player.seat}`}
                card={card}
                size={size}
              />
            ) : (
              <TelopReverseCard
                key={`reverse-${index}-${player.seat}`}
                size={size}
              />
            );
          })}
        </div>
        {odds && (
          <div className={oddsClass} style={oddsSize}>
            {odds}
          </div>
        )}
      </div>

      <div
        className="relative mb-1 flex items-center justify-center rounded-xs px-4 py-1 text-white"
        style={{ backgroundColor: "#BB251A" }}
      >
        <div className="flex w-full items-center justify-center">
          <span className={nameClass}>{player.name}</span>
          {isWinner && (
            <img alt="winner" className={winnerIconClass} src={CheckMarkSvg} />
          )}
        </div>
      </div>

      <div className="flex gap-1">
        <div className="flex flex-1 items-center justify-center rounded-xs bg-black px-2 py-1.5 text-center text-white">
          <span className={positionClass}>{position || "-"}</span>
        </div>

        {isFolded && (
          <div className="flex flex-1 items-center justify-center rounded-xs bg-red-500 px-2 py-1.5 text-center font-bold text-white uppercase">
            FOLD
          </div>
        )}
      </div>
    </div>
  );
}
