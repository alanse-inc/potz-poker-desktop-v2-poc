import { Flipped, Flipper } from "react-flip-toolkit";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../../../../domain/auto_game/types";
import type {
  PlayerCardSize,
  PlayerGroupSide,
  TelopAnimationSettings,
} from "../../../auto_types";
import { ResizeHandles } from "../../../components/ResizeHandles";
import { FLIP_ANIMATION_CONFIG } from "../../../constants";
import { useAnimationList } from "../../../hooks/useAnimationList";
import { useResizeHandle } from "../../../hooks/useResizeHandle";
import { ClassicAutoPlayerCard } from "./PlayerCard";

type Props = {
  board: AutoModeBoard;
  players: AutoModePlayer[];
  side: PlayerGroupSide;
  animationSettings: TelopAnimationSettings;
  onAnimationComplete?: () => void;
  startAnimation?: boolean;
  playersMovingFromRight?: Set<string>;
  size?: PlayerCardSize;
  scale?: number;
  onScaleChange?: (newScale: number) => void;
};

export function ClassicAutoPlayerCards({
  players,
  board,
  side,
  animationSettings,
  onAnimationComplete,
  startAnimation = true,
  playersMovingFromRight,
  size = "small",
  scale = 1,
  onScaleChange,
}: Props) {
  const {
    activePlayers,
    exitingPlayers,
    flipKey,
    itemsLoaded,
    getAnimationStyle,
    createElementId,
  } = useAnimationList<AutoModePlayer>(players, {
    animationSettings,
    startAnimation,
    onAnimationComplete,
    itemsMovingFromRight: playersMovingFromRight,
    getItemId: (player) => player.id,
    side,
    enableDomAnimations: true,
    waitForCardLoad: true,
  });

  const { containerRef, handleResizeStart } = useResizeHandle({
    onScaleChange,
    currentScale: scale,
  });

  if (!startAnimation || !itemsLoaded) {
    return null;
  }

  const scaledStyle = {
    fontSize: `${scale}rem`,
    gap: `${0.375 * scale}rem`,
  };

  const scaledMargin = {
    marginLeft: side === "left" ? `${5 * scale}rem` : undefined,
    marginRight: side === "right" ? `${5 * scale}rem` : undefined,
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col justify-end overflow-visible"
    >
      {onScaleChange && <ResizeHandles onMouseDown={handleResizeStart} />}

      <Flipper
        flipKey={`${side}-${flipKey}-${activePlayers.length}-${exitingPlayers.length}`}
        spring={FLIP_ANIMATION_CONFIG.main}
        className="relative overflow-visible"
        element="div"
        decisionData={[...activePlayers, ...exitingPlayers]}
      >
        <div
          className={`flex flex-col overflow-visible ${side === "left" ? "items-start" : "items-end"}`}
          style={scaledStyle}
        >
          {activePlayers.map((animatedPlayer) => {
            const animationStyle = getAnimationStyle(animatedPlayer);
            const elementId = createElementId(animatedPlayer);

            return (
              <Flipped key={animatedPlayer.item.id} flipId={elementId}>
                <div
                  id={elementId}
                  style={{
                    ...animationStyle,
                    ...scaledMargin,
                  }}
                >
                  <ClassicAutoPlayerCard
                    player={animatedPlayer.item}
                    board={board}
                    side={side}
                    size={size}
                  />
                </div>
              </Flipped>
            );
          })}

          {exitingPlayers.map((exitingPlayer) => {
            const animationStyle = getAnimationStyle(exitingPlayer);
            const elementId = createElementId(exitingPlayer);

            return (
              <Flipped key={exitingPlayer.item.id} flipId={elementId}>
                <div
                  id={elementId}
                  style={{
                    ...animationStyle,
                    ...scaledMargin,
                  }}
                >
                  <ClassicAutoPlayerCard
                    player={exitingPlayer.item}
                    board={board}
                    side={side}
                    size={size}
                  />
                </div>
              </Flipped>
            );
          })}
        </div>
      </Flipper>
    </div>
  );
}
