import type { TelopAnimationSettings } from "./auto_types";

export const CURRENT_PLAYER_MARGIN = "5rem" as const;

export const FLIP_ANIMATION_CONFIG = {
  main: {
    stiffness: 300,
    damping: 30,
    mass: 1,
  },
  exit: {
    stiffness: 200,
    damping: 20,
    mass: 0.6,
  },
} as const;

export const DOM_ANIMATION_TIMING = {
  applyDelay: 60,
  movementClearDelay: 100,
} as const;

export const DEFAULT_TELOP_ANIMATION_SETTINGS: TelopAnimationSettings = {
  fadeInDuration: 750,
  slideUpDuration: 800,
  fadeOutDuration: 600,
  leftInitialX: "-200px",
  rightInitialX: "200px",
  slideUpDistance: "-120px",
  slideAwayDistance: "-100px",
  springConfig: {
    move: {
      stiffness: 400,
      damping: 18,
      mass: 0.9,
      overshootClamping: false,
    },
    fade: {
      stiffness: 380,
      damping: 19,
      mass: 0.8,
      overshootClamping: false,
    },
  },
  staggerConfig: {
    speed: 0.9,
    reverse: false,
  },
} as const;
