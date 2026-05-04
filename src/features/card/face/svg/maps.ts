import type { Suit } from "../../../../types";

// Import suits
import clubSvg from "./suits/club.svg";
import diamondSvg from "./suits/diamond.svg";
import heartSvg from "./suits/heart.svg";
import spadeSvg from "./suits/spade.svg";

// Import values
import value2Svg from "./values/2.svg";
import value3Svg from "./values/3.svg";
import value4Svg from "./values/4.svg";
import value5Svg from "./values/5.svg";
import value6Svg from "./values/6.svg";
import value7Svg from "./values/7.svg";
import value8Svg from "./values/8.svg";
import value9Svg from "./values/9.svg";
import value10Svg from "./values/10.svg";
import valueASvg from "./values/A.svg";
import valueJSvg from "./values/J.svg";
import valueKSvg from "./values/K.svg";
import valueQSvg from "./values/Q.svg";

// Tauri版のCardValueは "T" を使うが、SVGは "10" にマップする
export type SvgCardValue =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";

export const suitSvgMap: Record<Suit, string> = {
  club: clubSvg,
  diamond: diamondSvg,
  heart: heartSvg,
  spade: spadeSvg,
};

export const valueSvgMap: Record<SvgCardValue, string> = {
  "2": value2Svg,
  "3": value3Svg,
  "4": value4Svg,
  "5": value5Svg,
  "6": value6Svg,
  "7": value7Svg,
  "8": value8Svg,
  "9": value9Svg,
  T: value10Svg,
  A: valueASvg,
  J: valueJSvg,
  K: valueKSvg,
  Q: valueQSvg,
};
