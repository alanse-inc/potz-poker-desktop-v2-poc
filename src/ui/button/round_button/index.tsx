import { match, P } from "ts-pattern";
import { usePressAnimation } from "../use_press_animation";

type Props = {
  type: "primary" | "black" | "dark-gray";
  size: "small" | "medium" | "large" | "full" | "auto";
  text: string;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
};

export function RoundButton({
  type,
  text,
  size,
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

  const width = match(size)
    .with("small", () => "w-30")
    .with("medium", () => "w-60")
    .with("large", () => "w-sm")
    .with("full", () => "w-full")
    .with("auto", () => "w-auto")
    .exhaustive();

  const textColor = match(type)
    .with("primary", () => "text-black")
    .with(P.union("black", "dark-gray"), () => "text-white")
    .exhaustive();

  const backgroundColor = match(type)
    .with("primary", () => "bg-primary")
    .with("black", () => "bg-black-deep")
    .with("dark-gray", () => "bg-background-dark-gray")
    .exhaustive();

  const border = match(type)
    .with("black", () => "border border-border-white")
    .otherwise(() => "");

  const opacity = disabled ? "opacity-50" : "";
  const cursor = disabled ? "cursor-not-allowed" : "cursor-pointer";
  const pressedClasses = isPressed ? "scale-95 brightness-90" : "";

  return (
    <button
      type="button"
      className={`flex h-14 items-center justify-center rounded-full px-8 font-bold text-sm transition-all duration-75 ${width} ${textColor} ${backgroundColor} ${border} ${opacity} ${cursor} ${pressedClasses} ${className}`}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      onClick={onClick}
    >
      {text}
    </button>
  );
}
