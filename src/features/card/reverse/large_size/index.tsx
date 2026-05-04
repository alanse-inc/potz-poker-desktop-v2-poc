type LargeReverseCardProps = {
  onClick?: () => void;
};

/**
 * トランプの裏面を表示するコンポーネント(大サイズ)
 */
export function LargeReverseCard(props: LargeReverseCardProps) {
  const handleInteraction = () => {
    props.onClick?.();
  };

  return (
    <button
      type="button"
      className="flex h-24 w-18 flex-col items-center justify-center gap-4 rounded-md bg-blue-600 px-3 py-2"
      onClick={handleInteraction}
    />
  );
}
