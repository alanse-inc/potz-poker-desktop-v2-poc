import type {
  AutoModeBoard,
  AutoModePlayer,
} from "../../domain/auto_game/types";

export type { AutoModePlayer, AutoModeBoard };

export type PlayerGroupSide = "left" | "right";

export type PlayerCardSize = "small" | "large";

export type SpringConfig = {
  stiffness: number;
  damping: number;
  overshootClamping?: boolean;
  mass?: number;
};

export type TelopAnimationSettings = {
  fadeInDuration: number;
  slideUpDuration: number;
  fadeOutDuration: number;
  leftInitialX: string;
  rightInitialX: string;
  slideUpDistance: string;
  slideAwayDistance: string;
  springConfig: {
    move: SpringConfig;
    fade: SpringConfig;
  };
  staggerConfig: {
    speed: number;
    reverse: boolean;
  };
};

export type AnimationSettings = {
  fadeInDuration: number;
  fadeOutDuration: number;
  leftInitialX: string;
  rightInitialX: string;
};

export type AnimationState =
  | "queued"
  | "entering"
  | "active"
  | "exiting"
  | "from-right";

export type AnimatedItem<T> = {
  item: T;
  state: AnimationState;
  key: string;
  exitDirection?: PlayerGroupSide;
  previousPosition?: number;
  isFromRight?: boolean;
};

export type ExitingItemPosition = {
  index: number;
  timestamp: number;
  seat: number;
};

export type UseTelopAnimationOptions<T> = {
  animationSettings: AnimationSettings;
  startAnimation?: boolean;
  onAnimationComplete?: () => void;
  itemsMovingFromRight?: Set<string>;
  getItemId: (item: T) => string | number;
  side?: PlayerGroupSide;
  enableDomAnimations?: boolean;
  waitForCardLoad?: boolean;
};

export type UsePlayerLayoutOptions = {
  maxLeftPlayers?: number;
  animationSettings: AnimationSettings;
};

export type PlayerLayoutResult<T> = {
  size: PlayerCardSize;
  playersLeft: T[];
  playersRight: T[];
  playersMovingFromRight: Set<string>;
  startRightAnimation: boolean;
  handleLeftAnimationComplete: () => void;
};
