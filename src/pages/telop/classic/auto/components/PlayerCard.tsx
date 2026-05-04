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

export function ClassicAutoPlayerCard({
  player,
  board,
  size = "small",
}: Props) {
  const { odds, isFolded, hand, position, isWinner } =
    useAutoPlayerDisplayHelpers({ player, board });

  if (!player) {
    trackClientSideError("ClassicAutoPlayerCard: player is undefined");
    return null;
  }

  const containerWidth = match(size)
    .with("small", () => 250)
    .with("large", () => 360)
    .exhaustive();

  const photoSize = match(size)
    .with("small", () => ({ width: 62, height: 62 }))
    .with("large", () => ({ width: 96, height: 96 }))
    .exhaustive();

  const rightAreaWidth = match(size)
    .with("small", () => 80)
    .with("large", () => 88)
    .exhaustive();

  const oddsTextClass = match(size)
    .with("small", () => "text-[13px]")
    .with("large", () => "text-[18px]")
    .exhaustive();

  const positionTextClass = match(size)
    .with("small", () => "text-[14px]")
    .with("large", () => "text-[20px]")
    .exhaustive();

  const nameTextClass = match(size)
    .with("small", () => "text-[20px]")
    .with("large", () => "text-[28px]")
    .exhaustive();

  const gap = match(size)
    .with("small", () => 2)
    .with("large", () => 2)
    .exhaustive();

  const lowerBarHeight = match(size)
    .with("small", () => 34)
    .with("large", () => 48)
    .exhaustive();

  const winnerIconClass = match(size)
    .with("small", () => "h-5 w-5")
    .with("large", () => "h-7 w-7")
    .exhaustive();

  const borderRadius = match(size)
    .with("small", () => 4)
    .with("large", () => 6)
    .exhaustive();

  return (
    <div
      style={{ width: containerWidth, fontFamily: "Oswald", gap }}
      className={`flex flex-col font-bold ${isFolded ? "opacity-50" : ""}`}
      data-position={position}
      data-folded={isFolded ? "true" : "false"}
    >
      <div className="flex items-end" style={{ gap }}>
        <div
          className="flex-shrink-0 overflow-hidden border-2 border-white bg-black"
          style={{
            width: photoSize.width,
            height: photoSize.height,
            borderRadius,
          }}
        >
          <img
            src={player.icon || PlayerSVG}
            alt="player-icon"
            className="h-full w-full object-cover"
          />
        </div>

        <div className="flex" style={{ gap }}>
          {[...Array(2)].map((_, index) => {
            const card = hand && index < hand.length ? hand[index] : null;
            return card ? (
              <TelopFaceCard
                key={`card-${player.id}-${index}`}
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

        <div
          className="ml-auto flex flex-col"
          style={{
            width: rightAreaWidth,
            height: photoSize.height,
            gap: 2,
          }}
        >
          <div
            className={`flex flex-1 items-center justify-center rounded-sm border-2 border-white bg-black text-white ${positionTextClass}`}
          >
            {position || "-"}
          </div>

          <div
            className={`flex flex-1 items-center justify-center rounded-sm border-2 border-white bg-black text-white ${oddsTextClass}`}
          >
            {odds || "-"}
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-center rounded-b-sm border-2 border-white bg-[#336699] text-white"
        style={{
          height: lowerBarHeight,
          paddingLeft: 8,
          paddingRight: 8,
        }}
      >
        <span className={`truncate uppercase ${nameTextClass}`}>
          {player.name}
          {isWinner && (
            <img
              alt="winner"
              className={`ml-1 inline ${winnerIconClass}`}
              src={CheckMarkSvg}
            />
          )}
        </span>
      </div>
    </div>
  );
}
