import { useMemo } from "react";

/**
 * モバイルデバイス（iOS/Android/iPadOS）を判定するカスタムフック
 *
 * @returns モバイルデバイスの場合は true
 *
 * @remarks
 * iPadOS 13 以降ではデスクトップモードがデフォルトになるため、
 * User Agent だけでなくタッチポイントの有無も確認する。
 */
export const useIsMobileDevice = (): boolean => {
  return useMemo(() => {
    if (typeof window === "undefined") return false;

    return (
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent))
    );
  }, []);
};
