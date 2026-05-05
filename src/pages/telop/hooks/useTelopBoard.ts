import { useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import type { TexasHoldemBoard } from "../../../types";

/**
 * テロップウィンドウ用のボードデータ取得フック
 * Tauri event (telop_updated / board_updated) を listen して最新状態を保持する
 */
export function useTelopBoard() {
  const [board, setBoard] = useState<TexasHoldemBoard | null>(null);
  const initialLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unlistenBoard: (() => void) | undefined;

    // リスナーを先に登録し、getBoard 完了後にのみイベントを反映する
    api.notifications
      .onBoardUpdated((updated) => {
        if (!cancelled && initialLoadedRef.current) {
          setBoard(updated ?? null);
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlistenBoard = fn;
        }
      })
      .catch(() => {});

    // 初期ボード取得し、完了後にリスナーを有効化
    api.board
      .getBoard()
      .then((b) => {
        if (!cancelled) {
          setBoard(b);
          initialLoadedRef.current = true;
        }
      })
      .catch(() => {
        // board が null の場合はモック表示になる
        if (!cancelled) {
          initialLoadedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
      unlistenBoard?.();
    };
  }, []);

  // プレイ中のプレイヤー（fold / hand なし 除外）
  const activePlayers = board?.players.filter(
    (p) => !p.hasFolded && p.hand !== null,
  );

  return { board, activePlayers: activePlayers ?? [] };
}
