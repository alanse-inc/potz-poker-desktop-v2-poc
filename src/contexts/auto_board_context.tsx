/**
 * Auto Game ボードコンテキスト
 *
 * Auto Mode 専用の Board 状態管理。通常ゲームの BoardContext とは独立して動作する。
 * ボード状態は localStorage に永続化し、ページ遷移後も保持される。
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import type { AutoModeBoard } from "../domain/auto_game/types";

const STORAGE_KEY = "auto_mode_board";

function loadFromStorage(): AutoModeBoard | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutoModeBoard;
  } catch {
    return null;
  }
}

function saveToStorage(board: AutoModeBoard | null): void {
  try {
    if (board === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    }
  } catch {
    // ストレージ書き込み失敗は無視
  }
}

type AutoBoardContextValue = {
  board: AutoModeBoard | null;
  setBoard: (board: AutoModeBoard) => void;
  resetBoard: () => void;
};

const AutoBoardContext = createContext<AutoBoardContextValue | null>(null);

export function AutoBoardProvider({ children }: { children: ReactNode }) {
  const [board, setBoardState] = useState<AutoModeBoard | null>(
    loadFromStorage,
  );

  const setBoard = useCallback((b: AutoModeBoard) => {
    setBoardState(b);
    saveToStorage(b);
  }, []);

  const resetBoard = useCallback(() => {
    setBoardState(null);
    saveToStorage(null);
  }, []);

  return (
    <AutoBoardContext.Provider value={{ board, setBoard, resetBoard }}>
      {children}
    </AutoBoardContext.Provider>
  );
}

export function useAutoBoard(): AutoBoardContextValue {
  const ctx = useContext(AutoBoardContext);
  if (!ctx) {
    throw new Error("useAutoBoard must be used within AutoBoardProvider");
  }
  return ctx;
}
