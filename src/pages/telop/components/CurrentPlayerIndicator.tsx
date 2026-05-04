type Props = {
  borderRadius?: number;
  strokeWidth?: number;
  /** ストロークの色（デフォルト: #fff） */
  strokeColor?: string;
};

/**
 * 現在のプレイヤーを示すアニメーション枠線
 */
export function CurrentPlayerIndicator({
  borderRadius = 12,
  strokeWidth = 6,
  strokeColor = "#fff",
}: Props) {
  const gradientId = `strokeGradient-${strokeColor.replace("#", "")}`;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-50 h-full w-full"
      height="100%"
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Current player indicator"
    >
      <title>Current player indicator</title>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="1" />
          <stop offset="30%" stopColor={strokeColor} stopOpacity="0.9" />
          <stop offset="60%" stopColor={strokeColor} stopOpacity="0.7" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <rect
        rx={borderRadius}
        ry={borderRadius}
        height="100%"
        width="100%"
        strokeLinejoin="round"
        fill="transparent"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeDasharray="260"
      />
    </svg>
  );
}
