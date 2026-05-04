import PlayerSVG from "../player.svg";

type Props = {
  playerIcon: string | null;
  bgColor: "white" | "gray";
  highlight?: boolean;
  size?: "xs" | "sm" | "small" | "medium" | "large";
};

const bgClassMap = {
  white: "bg-white",
  gray: "bg-gray-700",
} as const;

const borderClassMap = {
  white: "border-gray-400",
  gray: "border-white",
} as const;

const sizeClassMap = {
  xs: "h-[45px] w-[45px]",
  sm: "h-[57.59px] w-[57.59px]",
  small: "h-14 w-14",
  medium: "h-[72px] w-[72px]",
  large: "h-22 w-22",
} as const;

/**
 * プレイヤーのアイコンを表示するコンポーネント
 *
 * アイコンが指定されていない場合は、デフォルトのアイコンを表示する
 */
export function PlayerIcon({ size = "small", ...props }: Props) {
  const bgClass = bgClassMap[props.bgColor];
  const borderClass = props.highlight
    ? "border-primary"
    : borderClassMap[props.bgColor];
  const sizeClass = sizeClassMap[size];

  return (
    <img
      className={`rounded-full border-2 object-cover ${sizeClass} ${borderClass} ${bgClass}`}
      src={props.playerIcon || PlayerSVG}
      alt="player-icon"
    />
  );
}
