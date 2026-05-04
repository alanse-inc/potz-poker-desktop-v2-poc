import { match, P } from "ts-pattern";
import { usePressAnimation } from "../use_press_animation";

type Props = {
  type:
    | "primary"
    | "black"
    | "gray"
    | "light-gray"
    | "blue"
    | "orange"
    | "white";
  text: [string, string?];
  size?: "normal" | "mini";
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
};

export function SquareButton({
  type,
  text,
  size = "normal",
  disabled = false,
  className = "",
  onClick,
}: Props) {
  const {
    isPressed,
    handlePointerDown,
    handlePointerUp,
    handlePointerLeave,
    handlePointerCancel,
  } = usePressAnimation(disabled);

  const height = match(size)
    .with("normal", () => "h-24")
    .with("mini", () => "h-12")
    .exhaustive();

  const textColor = match(type)
    .with(P.union("primary", "light-gray", "white"), () => "text-black")
    .with(P.union("black", "gray", "blue", "orange"), () => "text-white")
    .exhaustive();

  const backgroundColor = match(type)
    .with("primary", () => "bg-primary")
    .with("black", () => "bg-background-black")
    .with("gray", () => "bg-background-gray")
    .with("light-gray", () => "bg-background-light-gray")
    .with("blue", () => "bg-action-check-call")
    .with("orange", () => "bg-action-bet-raise")
    .with("white", () => "bg-white")
    .exhaustive();

  const border = match(type)
    .with("black", () => "border border-border-white")
    .with("white", () => "border border-border-gray")
    .otherwise(() => "");

  const opacity = disabled ? "opacity-50" : "";
  const cursor = disabled ? "cursor-not-allowed" : "cursor-pointer";
  const pressedClasses = isPressed ? "scale-95 brightness-90" : "";

  return (
    <button
      type="button"
      className={`flex w-28 flex-col items-center justify-center rounded-lg font-bold text-sm transition-all duration-75 ${height} ${textColor} ${backgroundColor} ${border} ${opacity} ${cursor} ${pressedClasses} ${className}`}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      onClick={onClick}
    >
      <p>{text[0]}</p>
      {text[1] && size === "normal" && <p>{text[1]}</p>}
    </button>
  );
}
