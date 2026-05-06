/**
 * useSSEConnection — Tauri 2 版
 *
 * Electron 版では EventSource (Web SSE) を使っていたが、
 * Tauri 版では Rust 側から emit される Tauri イベントを listen() で購読する。
 *
 * 必要な Tauri イベント名 (Rust 側で emit が必要):
 *   - board_updated          (payload: TexasHoldemBoard | null)
 *   - initial_board_updated  (payload: TexasHoldemInitialBoard | null)
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
    let cancelled = false;
    const pendingListenPromises: Array<Promise<() => void>> = [];

    // board_updated
    pendingListenPromises.push(
      api.notifications
        .onBoardUpdated((board) => {
          if (cancelled) return;
          onEventRef.current({ event: "board-updated", data: board });
        })
        .catch((err) => {
          console.error(
            "[useSSEConnection] Failed to listen board_updated:",
            err,
          );
          return () => {};
        }),
    );

    // initial_board_updated
    pendingListenPromises.push(
      api.notifications
        .onInitialBoardUpdated((board) => {
          if (cancelled) return;
          onEventRef.current({ event: "initial-board-updated", data: board });
        })
        .catch((err) => {
          console.error(
            "[useSSEConnection] Failed to listen initial_board_updated:",
            err,
          );
          return () => {};
        }),
    );

    // telop_id_updated → telop-updated (type: "telop-id")
    pendingListenPromises.push(
      api.notifications
        .onTelopIdUpdated((telopId) => {
          if (cancelled) return;
          onEventRef.current({
            event: "telop-updated",
            data: { type: "telop-id", telopId },
          });
        })
        .catch((err) => {
          console.error(
            "[useSSEConnection] Failed to listen telop_id_updated:",
            err,
          );
          return () => {};
        }),
    );

    // telop_background_color_updated → telop-updated (type: "background-color")
    pendingListenPromises.push(
      api.notifications
        .onTelopBackgroundColorUpdated((color) => {
          if (cancelled) return;
          onEventRef.current({
            event: "telop-updated",
            data: { type: "background-color", color },
          });
        })
        .catch((err) => {
          console.error(
            "[useSSEConnection] Failed to listen telop_background_color_updated:",
            err,
          );
          return () => {};
        }),
    );

    // telop_current_screen_updated → telop-updated (type: "current-screen")
    pendingListenPromises.push(
      api.notifications
        .onTelopCurrentScreenUpdated((screen) => {
          if (cancelled) return;
          onEventRef.current({
            event: "telop-updated",
            data: { type: "current-screen", screen },
          });
        })
        .catch((err) => {
          console.error(
            "[useSSEConnection] Failed to listen telop_current_screen_updated:",
            err,
          );
          return () => {};
        }),
    );

    // card_placed
    pendingListenPromises.push(
      api.notifications
        .onCardPlaced((payload) => {
          if (cancelled) return;
          onEventRef.current({ event: "card-placed", data: payload });
        })
        .catch((err) => {
          console.error(
            "[useSSEConnection] Failed to listen card_placed:",
            err,
          );
          return () => {};
        }),
    );

    // serial_status_updated → connection-status-updated
    pendingListenPromises.push(
      api.notifications
        .onSerialStatusUpdated((status) => {
          if (cancelled) return;
          onEventRef.current({
            event: "connection-status-updated",
            data: status,
          });
        })
        .catch((err) => {
          console.error(
            "[useSSEConnection] Failed to listen serial_status_updated:",
            err,
          );
          return () => {};
        }),
    );

    // クリーンアップ: cancelled フラグを立て、未解決の Promise を含む全 listener を解除
    return () => {
      cancelled = true;
      for (const p of pendingListenPromises) {
        p.then((fn) => fn()).catch(() => {});
      }
    };
  }, []); // NOTE: onEventRef を使うことで再購読を防ぐ
}
