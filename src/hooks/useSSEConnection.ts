/**
 * useSSEConnection — Tauri 2 版
 *
 * Electron 版では EventSource (Web SSE) を使っていたが、
 * Tauri 版では Rust 側から emit される Tauri イベントを listen() で購読する。
 *
 * 必要な Tauri イベント名 (Rust 側で emit が必要):
 *   - board_updated          (payload: TexasHoldemBoard | null)
 *   - initial_board_updated  (payload: TexasHoldemInitialBoard | null)
 *   - game_settings_updated  (payload: GameSettings)
 *   - telop_id_updated       (payload: TelopId)
 *   - telop_background_color_updated (payload: string)
 *   - telop_current_screen_updated   (payload: TelopScreenState)
 *   - card_placed            (payload: CardPlacedPayload)
 *   - serial_status_updated  (payload: SerialStatus)
 *
 * NOTE: Electron 版の "auto-mode-board-updated", "route-updated", "app-update-status"
 * イベントは本 Tauri 版では未サポート。SSEEvent 型からも除外している。
 */

import { useEffect, useRef } from "react";
import { api } from "../api/client";
import type {
  CardPlacedPayload,
  GameSettings,
  SerialStatus,
  TelopId,
  TelopScreenState,
  TexasHoldemBoard,
  TexasHoldemInitialBoard,
} from "../types";

// ---------------------------------------------------------------------------
// SSEEvent 型 (Tauri 版)
// ---------------------------------------------------------------------------

/**
 * SSE 相当のイベントのユニオン型
 * Electron 版の SSEEvent に対応するが、Tauri でサポートするイベントのみ定義
 */
export type SSEEvent =
  | {
      event: "board-updated";
      data: TexasHoldemBoard | null;
    }
  | {
      event: "initial-board-updated";
      data: TexasHoldemInitialBoard | null;
    }
  | {
      event: "game-settings-updated";
      data: GameSettings;
    }
  | {
      event: "telop-updated";
      data:
        | { type: "telop-id"; telopId: TelopId }
        | { type: "background-color"; color: string }
        | { type: "current-screen"; screen: TelopScreenState };
    }
  | {
      event: "card-placed";
      data: CardPlacedPayload;
    }
  | {
      event: "connection-status-updated";
      data: SerialStatus;
    };

/**
 * SSE リスナーのコールバック型
 */
export type SSECallback = (event: SSEEvent) => void;

// ---------------------------------------------------------------------------
// フック
// ---------------------------------------------------------------------------

/**
 * SSE 相当のイベント購読フック（Tauri 2 版）
 *
 * Tauri の listen() を使って各 Rust イベントを購読し、
 * Electron 版 SSEEvent 互換の形式でコールバックに渡す。
 *
 * @param onEvent - イベント受信時のコールバック関数
 */
export function useSSEConnection(onEvent: SSECallback): void {
  const onEventRef = useRef(onEvent);

  // onEvent の参照を最新に保つ（再レンダリング時に更新）
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    // 各 Tauri イベントのアンリスン関数を収集
    const unlisteners: Array<() => void> = [];

    // board_updated
    api.notifications
      .onBoardUpdated((board) => {
        onEventRef.current({ event: "board-updated", data: board });
      })
      .then((fn) => unlisteners.push(fn))
      .catch((err) => {
        console.error(
          "[useSSEConnection] Failed to listen board_updated:",
          err,
        );
      });

    // initial_board_updated
    api.notifications
      .onInitialBoardUpdated((board) => {
        onEventRef.current({ event: "initial-board-updated", data: board });
      })
      .then((fn) => unlisteners.push(fn))
      .catch((err) => {
        console.error(
          "[useSSEConnection] Failed to listen initial_board_updated:",
          err,
        );
      });

    // telop_id_updated → telop-updated (type: "telop-id")
    api.notifications
      .onTelopIdUpdated((telopId) => {
        onEventRef.current({
          event: "telop-updated",
          data: { type: "telop-id", telopId },
        });
      })
      .then((fn) => unlisteners.push(fn))
      .catch((err) => {
        console.error(
          "[useSSEConnection] Failed to listen telop_id_updated:",
          err,
        );
      });

    // telop_background_color_updated → telop-updated (type: "background-color")
    api.notifications
      .onTelopBackgroundColorUpdated((color) => {
        onEventRef.current({
          event: "telop-updated",
          data: { type: "background-color", color },
        });
      })
      .then((fn) => unlisteners.push(fn))
      .catch((err) => {
        console.error(
          "[useSSEConnection] Failed to listen telop_background_color_updated:",
          err,
        );
      });

    // telop_current_screen_updated → telop-updated (type: "current-screen")
    api.notifications
      .onTelopCurrentScreenUpdated((screen) => {
        onEventRef.current({
          event: "telop-updated",
          data: { type: "current-screen", screen },
        });
      })
      .then((fn) => unlisteners.push(fn))
      .catch((err) => {
        console.error(
          "[useSSEConnection] Failed to listen telop_current_screen_updated:",
          err,
        );
      });

    // card_placed
    api.notifications
      .onCardPlaced((payload) => {
        onEventRef.current({ event: "card-placed", data: payload });
      })
      .then((fn) => unlisteners.push(fn))
      .catch((err) => {
        console.error("[useSSEConnection] Failed to listen card_placed:", err);
      });

    // serial_status_updated → connection-status-updated
    api.notifications
      .onSerialStatusUpdated((status) => {
        onEventRef.current({
          event: "connection-status-updated",
          data: status,
        });
      })
      .then((fn) => unlisteners.push(fn))
      .catch((err) => {
        console.error(
          "[useSSEConnection] Failed to listen serial_status_updated:",
          err,
        );
      });

    // クリーンアップ: 全アンリスン関数を呼び出す
    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, []); // NOTE: onEventRef を使うことで再購読を防ぐ
}
