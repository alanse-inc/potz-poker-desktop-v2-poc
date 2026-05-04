import { useEffect, useRef, useState } from "react";
import type {
  AnimationSettings,
  PlayerCardSize,
  PlayerLayoutResult,
} from "../auto_types";
import { DOM_ANIMATION_TIMING } from "../constants";

export type UsePlayerLayoutOptions = {
  maxLeftPlayers?: number;
  animationSettings: AnimationSettings;
};

export function usePlayerLayout<T extends { id: string }>(
  players: T[],
  options: UsePlayerLayoutOptions,
): PlayerLayoutResult<T> {
  const { maxLeftPlayers = 5, animationSettings } = options;

  const [startRightAnimation, setStartRightAnimation] = useState(false);
  const previousLeftPlayersRef = useRef<Set<string>>(new Set());
  const previousRightPlayersRef = useRef<Set<string>>(new Set());
  const [playersMovingFromRight, setPlayersMovingFromRight] = useState<
    Set<string>
  >(new Set());

  const size: PlayerCardSize = players.length <= 4 ? "large" : "small";

  const { playersLeft, playersRight } = (() => {
    const totalPlayers = players.length;

    if (totalPlayers <= maxLeftPlayers) {
      return {
        playersLeft: players,
        playersRight: [] as T[],
      };
    }

    return {
      playersLeft: players.slice(0, maxLeftPlayers),
      playersRight: players.slice(maxLeftPlayers),
    };
  })();

  useEffect(() => {
    const currentLeftPlayerIds = new Set(playersLeft.map((p) => String(p.id)));
    const currentRightPlayerIds = new Set(
      playersRight.map((p) => String(p.id)),
    );

    const movedFromRight = new Set<string>();
    for (const playerId of currentLeftPlayerIds) {
      if (previousRightPlayersRef.current.has(playerId)) {
        movedFromRight.add(playerId);
      }
    }

    if (movedFromRight.size > 0) {
      setPlayersMovingFromRight(movedFromRight);

      setTimeout(() => {
        setPlayersMovingFromRight(new Set());
      }, animationSettings.fadeInDuration +
        DOM_ANIMATION_TIMING.movementClearDelay);
    }

    previousLeftPlayersRef.current = currentLeftPlayerIds;
    previousRightPlayersRef.current = currentRightPlayerIds;
  }, [playersLeft, playersRight, animationSettings.fadeInDuration]);

  useEffect(() => {
    if (playersRight.length === 0 && startRightAnimation) {
      setStartRightAnimation(false);
    }
  }, [playersRight.length, startRightAnimation]);

  const handleLeftAnimationComplete = () => {
    setStartRightAnimation(true);
  };

  return {
    size,
    playersLeft,
    playersRight,
    playersMovingFromRight,
    startRightAnimation,
    handleLeftAnimationComplete,
  };
}
