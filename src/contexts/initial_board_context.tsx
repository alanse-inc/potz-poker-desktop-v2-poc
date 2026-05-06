/**
 * 初期ボードコンテキスト
 *
 * Electron 版の initial_board_context.tsx を Tauri 2 に移植。
 * window.initialBoard / SSE を Tauri invoke + listen() に置き換え。
 * Rust 側コマンド: get_initial_board
 * Rust 側イベント: initial_board_updated
 */

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "../api/client";
import type { TexasHoldemInitialBoard } from "../types";

type InitialBoardContextType = {
  initialBoard: TexasHoldemInitialBoard | null;
};

const InitialBoardContext = createContext<InitialBoardContextType>({
  initialBoard: null,
});

export const InitialBoardProvider = ({ children }: { children: ReactNode }) => {
  const [initialBoard, setInitialBoard] =
    useState<TexasHoldemInitialBoard | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 初期状態を取得
    api.initialBoard
      .getInitialBoard()
      .then((board) => {
        if (!cancelled && board) {
          setInitialBoard(board);
        }
      })
      .catch(() => {
        // Rust 側未実装の場合は無視
      });

    // Tauri イベント経由で初期ボード更新を受け取る
    let unlisten: (() => void) | null = null;

    api.notifications
      .onInitialBoardUpdated((updatedBoard) => {
        setInitialBoard(updatedBoard);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <InitialBoardContext.Provider value={{ initialBoard }}>
      {children}
    </InitialBoardContext.Provider>
  );
};

export const useInitialBoard = () => {
  const context = useContext(InitialBoardContext);
  return context;
};
