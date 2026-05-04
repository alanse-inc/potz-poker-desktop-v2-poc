import { useEffect, useState } from "react";
import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../../../domain/auto_game/types";
import { DraggableResizableWrapper } from "../../components/DraggableResizableWrapper";
import { DEFAULT_TELOP_ANIMATION_SETTINGS } from "../../constants";
import { usePlayerLayout } from "../../hooks/usePlayerLayout";
import { TelopLayoutConfig } from "../../utils/telopLayoutConfig";
import { BasicAutoCommunityCards } from "./components/CommunityCards";
import { BasicAutoPlayerCards } from "./components/PlayerCards";

type Props = {
  board: AutoModeBoard;
  players: AutoModePlayer[];
};

export function TelopBasicAutoPage({ board, players }: Props) {
  const {
    size,
    playersLeft,
    playersRight,
    playersMovingFromRight,
    startRightAnimation,
    handleLeftAnimationComplete,
  } = usePlayerLayout(players, {
    maxLeftPlayers: 5,
    animationSettings: DEFAULT_TELOP_ANIMATION_SETTINGS,
  });

  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const layoutConfig = new TelopLayoutConfig({
    windowSize,
    baseMargin: 50,
    enableResize: true,
    leftPlayerCount: playersLeft.length,
    rightPlayerCount: playersRight.length,
  });

  const leftCardsConfig = layoutConfig.getLeftCardsConfig();
  const rightCardsConfig = layoutConfig.getRightCardsConfig();
  const communityCardsConfig = layoutConfig.getCommunityCardsConfig();

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ position: "relative" }}
    >
      <DraggableResizableWrapper
        config={leftCardsConfig}
        componentType="left-cards"
        debugColor="rgba(255, 0, 0, 0.1)"
        debugVisible={false}
      >
        <BasicAutoPlayerCards
          board={board}
          players={playersLeft}
          side="left"
          animationSettings={DEFAULT_TELOP_ANIMATION_SETTINGS}
          onAnimationComplete={handleLeftAnimationComplete}
          startAnimation={true}
          playersMovingFromRight={playersMovingFromRight}
          size={size}
        />
      </DraggableResizableWrapper>

      <DraggableResizableWrapper
        config={rightCardsConfig}
        componentType="right-cards"
        debugColor="rgba(0, 255, 0, 0.1)"
        debugVisible={false}
      >
        <BasicAutoPlayerCards
          board={board}
          players={playersRight}
          side="right"
          animationSettings={DEFAULT_TELOP_ANIMATION_SETTINGS}
          startAnimation={startRightAnimation}
          size={size}
        />
      </DraggableResizableWrapper>

      <DraggableResizableWrapper
        config={communityCardsConfig}
        componentType="community-cards"
        debugColor="rgba(0, 0, 255, 0.1)"
        debugVisible={false}
      >
        <BasicAutoCommunityCards
          communityCards={board.communityCards}
          gameName={board.setting.name}
        />
      </DraggableResizableWrapper>
    </div>
  );
}
