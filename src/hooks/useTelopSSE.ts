/**
 * useTelopSSE — Tauri 2 版
 *
 * テロップウィンドウ用イベント購読フック。
 *
 * Electron 版では SSE + window.notifications を使っていたが、
 * Tauri 版では useSSEConnection（Tauri listen() ベース）を通じてイベントを受け取り、
 * api.telopSettings invoke で初期値を取得する。
 *
 * 購読するイベント:
 *   - telop-updated  : テロップ ID / 背景色 / 画面状態
 *   - board-updated  : ボード情報（テロップはボードも表示）
 *   - game-settings-updated : ゲーム設定（現在のモード取得用）
 *
 * 初期値は useEffect 内で api.telopSettings.get* / api.board.getBoard を呼び出して同期。
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { TelopId, TelopScreenState, TexasHoldemBoard } from "../types";
import { type SSEEvent, useSSEConnection } from "./useSSEConnection";

// ---------------------------------------------------------------------------
// フック戻り値の型
// ---------------------------------------------------------------------------

export type TelopSSEState = {
  telopId: TelopId;
  backgroundColor: string;
  currentScreen: TelopScreenState;
  board: TexasHoldemBoard | null;
};

// ---------------------------------------------------------------------------
// フック
// ---------------------------------------------------------------------------

/**
 * テロップウィンドウ用 Tauri イベント購読フック
 *
 * @returns テロップ表示に必要な最新状態
 */
export function useTelopSSE(): TelopSSEState {
  const [telopId, setTelopId] = useState<TelopId>("modern");
  const [backgroundColor, setBackgroundColor] = useState("#00ff00");
  const [currentScreen, setCurrentScreen] = useState<TelopScreenState>(null);
  const [board, setBoard] = useState<TexasHoldemBoard | null>(null);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.event) {
      case "telop-updated": {
        const { data } = event;
        if (data.type === "telop-id") {
          setTelopId(data.telopId);
        } else if (data.type === "background-color") {
          setBackgroundColor(data.color);
        } else if (data.type === "current-screen") {
          setCurrentScreen(data.screen);
        }
        break;
      }
      case "board-updated": {
        setBoard(event.data);
        break;
      }
      // game-settings-updated は現時点でテロップ側に必要な処理なし
      default:
        break;
    }
  }, []);

  // Tauri イベントを購読
  useSSEConnection(handleSSEEvent);

  // 初期値を invoke で取得して同期
  useEffect(() => {
    const initialize = async () => {
      try {
        const id = await api.telopSettings.getTelopId();
        if (id) setTelopId(id);
      } catch {
        // Rust 側未実装の場合は無視
      }

      try {
        const color = await api.telopSettings.getBackgroundColor();
        if (color) setBackgroundColor(color);
      } catch {
        // Rust 側未実装の場合は無視
      }

      try {
        const screen = await api.telopSettings.getCurrentScreen();
        if (screen !== undefined) setCurrentScreen(screen);
      } catch {
        // Rust 側未実装の場合は無視
      }

      try {
        const boardData = await api.board.getBoard();
        setBoard(boardData);
      } catch {
        // Rust 側未実装の場合は無視
      }
    };

    void initialize();
  }, []);

  return { telopId, backgroundColor, currentScreen, board };
}
