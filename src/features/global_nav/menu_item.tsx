type Props = {
  active: boolean;
  iconSvg: string;
  label: string;
  onClick: () => void;
};

/**
 * GlobalNav の 1 メニュー項目。
 * SVG は currentColor 指定なので、インライン展開して
 * active/inactive の text-color を stroke/fill 色として転写する。
 */
export function MenuItem({ active, iconSvg, label, onClick }: Props) {
  const colorClass = active ? "text-primary" : "text-gray-700";
  const labelClass = active
    ? "font-bold text-primary"
    : "font-medium text-gray-700";

  // ローカルのアイコンSVGをインライン展開し、currentColor で stroke/fill を制御する
  const iconNode = (
    <span
      aria-hidden="true"
      className={`block size-6 ${colorClass}`}
      dangerouslySetInnerHTML={{ __html: iconSvg }}
    />
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer flex-col items-center gap-[2px]"
    >
      <div className="flex h-[44px] w-[44px] items-center justify-center rounded-[12px]">
        {iconNode}
      </div>
      <p className={`text-center text-[10px] leading-[12px] ${labelClass}`}>
        {label}
      </p>
    </button>
  );
}
