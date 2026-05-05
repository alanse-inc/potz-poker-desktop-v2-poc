/**
 * Auto Game ボードコンテキスト
 *
 * Auto Mode 専用の Board 状態管理。通常ゲームの BoardContext とは独立して動作する。
 * ボード状態は localStorage に永続化し、ページ遷移後も保持される。
 * Tauri の emit/listen を使ってメインウィンドウ→テロップウィンドウへ board 更新を通知する。
 */

import { emit, listen } from "@tauri-apps/api/event";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { AutoModeBoard } from "../domain/auto_game/types";

const STORAGE_KEY = "auto_mode_board";

/** Tauri イベント名: board 更新通知 */
export const AUTO_BOARD_UPDATED_EVENT = "auto_board_updated";

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
    // テロップウィンドウ（別 WebView）へ board 更新を broadcast する
    emit(AUTO_BOARD_UPDATED_EVENT, { board: b }).catch(() => {
      // emit 失敗は無視（localStorage フォールバックが存在する）
    });
  }, []);

  const resetBoard = useCallback(() => {
    setBoardState(null);
    saveToStorage(null);
    // リセットも通知する（null を送ることでテロップ側がモック表示に切り替わる）
    emit(AUTO_BOARD_UPDATED_EVENT, { board: null }).catch(() => {});
  }, []);

  // 他ウィンドウからの board 更新イベントを購読する
  // （テロップウィンドウ側でこの Provider を使う場合に有効）
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    listen<{ board: AutoModeBoard | null }>(AUTO_BOARD_UPDATED_EVENT, (e) => {
      setBoardState(e.payload.board);
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
