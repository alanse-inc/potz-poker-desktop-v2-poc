type SmallReverseCardProps = {
  className?: string;
  onClick?: () => void;
};

/**
 * トランプの裏面を表示するコンポーネント(小サイズ)
 *
 * NOTE: onClick が提供される場合のみ <button> を使用する。
 * PlayerCard（<button>）の内部で使用する場合は onClick を渡さないことで
 * <div> にフォールバックし、<button> のネストによる無効なHTMLを防ぐ。
 */
export function SmallReverseCard(props: SmallReverseCardProps) {
  const className = `flex h-[51px] w-[34px] flex-col items-center justify-center rounded border-2 border-blue-900 bg-blue-600 ${props.className}`;
  if (props.onClick) {
    return (
      <button type="button" className={className} onClick={props.onClick} />
    );
  }
  return <div className={className} />;
}
