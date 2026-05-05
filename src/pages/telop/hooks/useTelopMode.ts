import { useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import type { TelopMode } from "../types";

/**
 * テロップモードを取得するフック
 * telop_updated イベントの mode フィールドを監視する
 * GameSettings には mode がまだない場合は "basic" にフォールバック
 */
export function useTelopMode(): TelopMode {
  const [mode, setMode] = useState<TelopMode>("basic");
  const initialLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    // リスナーを先に登録し、getState 完了後にのみイベントを反映する
    api.notifications
      .onTelopUpdated((state) => {
        if (!cancelled && initialLoadedRef.current && state.mode) {
          setMode(state.mode as TelopMode);
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {});

    // 初期状態を取得し、完了後にリスナーを有効化
    api.telop
      .getState()
      .then((state) => {
        if (!cancelled) {
          if (state.mode) {
            setMode(state.mode as TelopMode);
          }
          initialLoadedRef.current = true;
        }
      })
      .catch(() => {
        if (!cancelled) {
          initialLoadedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return mode;
}
