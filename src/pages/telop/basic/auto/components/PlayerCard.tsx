import { match } from "ts-pattern";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../../../../domain/auto_game/types";
import { trackClientSideError } from "../../../../../features/error_tracker";
import { PlayerIcon } from "../../../../../features/player/player_icon";
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

export function BasicAutoPlayerCard({ player, board, size = "small" }: Props) {
  const { odds, isFolded, hand, position, isWinner } =
    useAutoPlayerDisplayHelpers({ player, board });

  if (!player) {
    trackClientSideError("BasicAutoPlayerCard: player is undefined");
    return null;
  }

  const containerClass = match(size)
    .with("small", () => "w-[280px] py-2 px-3")
    .with("large", () => "w-[400px] py-3 px-4")
    .exhaustive();

  const iconSizeClass = match(size)
    .with("small", () => "xs" as const)
    .with("large", () => "medium" as const)
    .exhaustive();

  const positionBadgeClass = match(size)
    .with("small", () => "text-sm px-1 py-0.5")
    .with("large", () => "text-base px-1.5 py-1")
    .exhaustive();

  const playerNameClass = match(size)
    .with("small", () => "text-base")
    .with("large", () => "text-xl")
    .exhaustive();

  const oddsClass = match(size)
    .with("small", () => "text-sm")
    .with("large", () => "text-lg")
    .exhaustive();

  const rowGapClass = match(size)
    .with("small", () => "gap-3")
    .with("large", () => "gap-4")
    .exhaustive();

  return (
    <div
      className={`relative flex items-stretch rounded-md border-2 border-[#D0D5DD] ${containerClass} ${rowGapClass} ${isFolded ? "opacity-50" : ""}`}
      style={{
        background:
          "linear-gradient(46deg, rgba(0, 0, 0, 1) 0%, rgba(85, 85, 85, 1) 100%)",
        boxShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)",
      }}
      data-position={position}
      data-folded={isFolded ? "true" : "false"}
    >
      <div className="flex shrink-0 items-center">
        <PlayerIcon
          size={iconSizeClass}
          bgColor="white"
          playerIcon={player.icon}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex items-center justify-between">
          {position && (
            <span
              className={`w-fit rounded font-bold text-[#222222] uppercase ${positionBadgeClass}`}
              style={{ backgroundColor: "#D9D9D9" }}
            >
              {position}
            </span>
          )}
          <p className={`font-bold text-[#F2F2F2] ${oddsClass}`}>{odds}</p>
        </div>
        <span
          className={`font-bold text-[#F2F2F2] uppercase ${playerNameClass}`}
        >
          {player.name}
        </span>
        {isFolded && (
          <span className="font-bold text-red-500 text-sm uppercase">FOLD</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
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

      {isWinner && (
        <div className="absolute right-[-40px] flex items-center justify-center">
          <img alt="winner" className="ml-3 h-10 w-10" src={CheckMarkSvg} />
        </div>
      )}
    </div>
  );
}
