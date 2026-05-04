import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { TelopMode } from "../types";

/**
 * テロップモードを取得するフック
 * telop_updated イベントの mode フィールドを監視する
 * GameSettings には mode がまだない場合は "basic" にフォールバック
 */
export function useTelopMode(): TelopMode {
  const [mode, setMode] = useState<TelopMode>("basic");

  useEffect(() => {
    // 初期状態を取得
    api.telop
      .getState()
      .then((state) => {
        if (state.mode) {
          setMode(state.mode as TelopMode);
        }
      })
      .catch(() => {});

    let unlisten: (() => void) | null = null;

    api.notifications
      .onTelopUpdated((state) => {
        if (state.mode) {
          setMode(state.mode as TelopMode);
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      unlisten?.();
    };
  }, []);

  return mode;
}
