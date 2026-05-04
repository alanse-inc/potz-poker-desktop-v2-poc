import { useLayoutEffect, useRef } from "react";

/**
 * コンテナのサイズに応じて子要素を自動的にスケーリングするHook
 * @param baseWidth - 基準となる幅（デザインの基準サイズ）
 * @param baseHeight - 基準となる高さ（デザインの基準サイズ）
 * @param maxScale - スケールの上限値（デフォルト: 1.0）
 * @param minScale - スケールの下限値（デフォルト: 0.5）
 *
 * NOTE: scale は useState ではなく直接 DOM 操作で適用する。
 * useState(scale) を使うと setScale が React の re-render を引き起こし、
 * レイアウト変化 → ResizeObserver 再発火 → setScale → re-render という
 * フィードバックループが発生してアクションボタンエリア全体のちらつきを引き起こす。
 */
export function useAutoScale(
  baseWidth = 1024,
  baseHeight = 768,
  maxScale = 1.0,
  minScale = 0.5,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !contentRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // アスペクト比を保ちながら、コンテナに収まる最大のスケールを計算
      const scaleX = containerWidth / baseWidth;
      const scaleY = containerHeight / baseHeight;
      let newScale = Math.min(scaleX, scaleY);

      // スケールの上限と下限を設定
      newScale = Math.max(minScale, Math.min(newScale, maxScale));

      // スケール変換を直接 DOM に適用（React state を介さない）
      contentRef.current.style.transform = `scale(${newScale})`;
      contentRef.current.style.transformOrigin = "center center";
    };

    // 初期スケールを設定
    updateScale();

    // リサイズイベントを監視
    const resizeObserver = new ResizeObserver(updateScale);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // ウィンドウリサイズも監視
    window.addEventListener("resize", updateScale);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [baseWidth, baseHeight, maxScale, minScale]);

  return { containerRef, contentRef };
}
