import { match } from "ts-pattern";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../../../../domain/auto_game/types";
import { trackClientSideError } from "../../../../../features/error_tracker";
import PlayerSVG from "../../../../../features/player/player.svg";
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

export function ModernAutoPlayerCard({ player, board, size = "small" }: Props) {
  const { odds, isFolded, hand, position, isWinner } =
    useAutoPlayerDisplayHelpers({ player, board });

  if (!player) {
    trackClientSideError("ModernAutoPlayerCard: player is undefined");
    return null;
  }

  const containerClass = match(size)
    .with("small", () => "w-[280px] min-w-[280px] px-2 py-1")
    .with("large", () => "w-[340px] min-w-[340px] px-2 py-2")
    .exhaustive();

  const iconClass = match(size)
    .with("small", () => "h-18 w-18")
    .with("large", () => "h-22 w-22")
    .exhaustive();

  const oddsClass = match(size)
    .with("small", () => "h-7 text-md font-extrabold")
    .with("large", () => "h-10 text-lg font-extrabold")
    .exhaustive();

  const positionClass = match(size)
    .with("small", () => "text-md font-extrabold uppercase")
    .with("large", () => "text-lg font-extrabold uppercase")
    .exhaustive();

  const nameClass = match(size)
    .with("small", () => "text-2xl font-extrabold")
    .with("large", () => "text-2xl font-extrabold")
    .exhaustive();

  const winnerIconClass = match(size)
    .with("small", () => "h-6 w-6 invert")
    .with("large", () => "h-8 w-8 invert")
    .exhaustive();

  return (
    <div
      style={{ fontFamily: "FuturaPT" }}
      className={`relative rounded-xl ${containerClass} ${isFolded ? "opacity-50" : ""}`}
      data-position={position}
      data-folded={isFolded ? "true" : "false"}
    >
      <div className="grid grid-cols-4 items-stretch">
        <div className="mr-0.5 flex items-end justify-center">
          <div
            className={`${iconClass} flex items-center justify-center overflow-hidden rounded-t-md bg-white`}
          >
            <img
              className="h-full w-full object-cover"
              src={player.icon || PlayerSVG}
              alt="player-icon"
            />
          </div>
        </div>

        <div className="col-span-3 flex flex-col">
          <div className="flex items-end justify-between">
            <div className="flex gap-0.5">
              {[...Array(2)].map((_, index) => {
                const card = hand && index < hand.length ? hand[index] : null;
                return card ? (
                  <TelopFaceCard
                    key={
                      card
                        ? `${card.suit}-${card.value}`
                        : `reverse-${player.id}-${index}`
                    }
                    card={card}
                    size={size}
                  />
                ) : (
                  <TelopReverseCard
                    key={`reverse-${player.id}-${index}`}
                    size={size}
                  />
                );
              })}
            </div>
            {odds && (
              <div
                className={`${oddsClass} flex items-center justify-center rounded-t-md bg-black px-4 text-white`}
              >
                <span>{odds}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 rounded-tr-sm bg-white px-2 py-0.5">
            <span className={positionClass}>{position}</span>
            <span className={nameClass}>{player.name}</span>
            {isWinner && (
              <img
                alt="winner"
                className={winnerIconClass}
                src={CheckMarkSvg}
              />
            )}
          </div>
        </div>
      </div>

      {isFolded && (
        <div className="flex items-center justify-center bg-red-500 px-2 py-0.5 font-extrabold text-sm text-white uppercase">
          FOLD
        </div>
      )}
    </div>
  );
}
