import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { TexasHoldemBoard } from "../../../types";

/**
 * テロップウィンドウ用のボードデータ取得フック
 * Tauri event (telop_updated / board_updated) を listen して最新状態を保持する
 */
export function useTelopBoard() {
  const [board, setBoard] = useState<TexasHoldemBoard | null>(null);

  useEffect(() => {
    // 初期ボード取得
    api.board
      .getBoard()
      .then(setBoard)
      .catch(() => {
        // board が null の場合はモック表示になる
      });

    let unlistenBoard: (() => void) | null = null;

    api.notifications
      .onBoardUpdated((updated) => {
        setBoard(updated);
      })
      .then((fn) => {
        unlistenBoard = fn;
      })
      .catch(() => {});

    return () => {
      unlistenBoard?.();
    };
  }, []);

  // プレイ中のプレイヤー（fold / hand なし 除外）
  const activePlayers = board?.players.filter(
    (p) => !p.hasFolded && p.hand !== null,
  );

  return { board, activePlayers: activePlayers ?? [] };
}
