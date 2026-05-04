type Props = {
  text: string;
  size?: "small" | "medium" | "large";
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export function CircleButton({
  text,
  size = "medium",
  className = "",
  onClick,
  disabled = false,
}: Props) {
  const sizeClasses = {
    small: "h-10 w-10 text-xl",
    medium: "h-14 w-14 text-3xl",
    large: "h-18 w-18 text-5xl",
  } as const;

  return (
    <button
      type="button"
      className={`flex items-center justify-center rounded-full border-2 bg-gray-900 text-white leading-none ${sizeClasses[size]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="-translate-y-[0.05em]">{text}</span>
    </button>
  );
}
