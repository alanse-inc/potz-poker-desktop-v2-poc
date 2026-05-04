/**
 * カード配置イベントコンテキスト
 *
 * Electron 版の card_placed_event.tsx を Tauri 2 に移植。
 * SSE/useSSEConnection を Tauri listen() に置き換え。
 * Rust 側イベント: card_placed / card_placed_unregistered / card_placed_register
 *
 * Electron 版は独自の CardPlacedEvent (register/unregistered/GameCardPlaced union) を使用していたが、
 * Tauri 版では既存の CardPlacedPayload (rfid, card, position) を利用する。
 * 未登録/登録モードイベントは別途 onCardPlacedUnregistered / onCardPlacedRegister で購読可能。
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "../api/client";
import type { CardPlacedPayload } from "../types";

type CardPlacedEventContextType = {
  placedEvent: CardPlacedPayload | null;
  /**
   * 手動でカード配置イベントを設定する
   * 基本的には Tauri イベントからの更新を購読するため乱用しない
   *
   * @deprecated
   */
  manualSetPlacedEvent: (placedEvent: CardPlacedPayload) => void;
  clearPlacedEvent: () => void;
};

const CardPlacedEventContext = createContext<CardPlacedEventContextType>({
  placedEvent: null,
  manualSetPlacedEvent: () => {},
  clearPlacedEvent: () => {},
});

export const CardPlacedEventProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [placedEvent, setPlacedEvent] = useState<CardPlacedPayload | null>(
    null,
  );

  const clearPlacedEvent = useCallback(() => {
    setPlacedEvent(null);
  }, []);

  const manualSetPlacedEvent = useCallback((event: CardPlacedPayload) => {
    setPlacedEvent(event);
  }, []);

  useEffect(() => {
    // Tauri イベント経由のカード配置イベントをリッスン
    let unlisten: (() => void) | null = null;

    api.notifications
      .onCardPlaced((payload) => {
        setPlacedEvent(payload);
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // Rust 側未実装の場合は無視
      });

    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <CardPlacedEventContext.Provider
      value={{ placedEvent, manualSetPlacedEvent, clearPlacedEvent }}
    >
      {children}
    </CardPlacedEventContext.Provider>
  );
};

export const useCardPlacedEvent = () => {
  const context = useContext(CardPlacedEventContext);
  return context;
};
