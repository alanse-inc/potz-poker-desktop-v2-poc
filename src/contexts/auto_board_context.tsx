/**
 * Auto Game ボードコンテキスト
 *
 * Auto Mode 専用の Board 状態管理。通常ゲームの BoardContext とは独立して動作する。
 * ボード状態は localStorage に永続化し、ページ遷移後も保持される。
 * Tauri の emit/listen を使ってメインウィンドウ→テロップウィンドウへ board 更新を通知する。
 */

import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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
  } catch (e) {
    console.error("[AutoBoard] localStorage write failed:", e);
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

  const myLabel = getCurrentWebviewWindow().label;

  const setBoard = useCallback(
    (b: AutoModeBoard) => {
      setBoardState(b);
      saveToStorage(b);
      // テロップウィンドウ（別 WebView）へ board 更新を broadcast する
      // source に自ウィンドウラベルを含めることで listener 側での二重更新を防ぐ
      emit(AUTO_BOARD_UPDATED_EVENT, { board: b, source: myLabel }).catch(
        () => {
          // emit 失敗は無視（localStorage フォールバックが存在する）
        },
      );
    },
    [myLabel],
  );

  const resetBoard = useCallback(() => {
    setBoardState(null);
    saveToStorage(null);
    // リセットも通知する（null を送ることでテロップ側がモック表示に切り替わる）
    emit(AUTO_BOARD_UPDATED_EVENT, { board: null, source: myLabel }).catch(
      () => {},
    );
  }, [myLabel]);

  // 他ウィンドウからの board 更新イベントを購読する
  // （テロップウィンドウ側でこの Provider を使う場合に有効）
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    listen<{ board: AutoModeBoard | null; source?: string }>(
      AUTO_BOARD_UPDATED_EVENT,
      (e) => {
        if (cancelled) return;
        // 自ウィンドウが emit したイベントは無視する（二重更新防止）
        if (e.payload.source === myLabel) return;
        setBoardState(e.payload.board);
        // テロップウィンドウ側の localStorage にも保存する
        // （WebviewWindow が独立した localStorage を持つ場合の reload 対策）
        saveToStorage(e.payload.board);
      },
    )
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
  }, [myLabel]);

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
