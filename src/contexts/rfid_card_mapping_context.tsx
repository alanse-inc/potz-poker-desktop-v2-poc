import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "../api/client";
import type { RfidCardMapping } from "../types";

/**
 * RFID カードマッピングコンテキスト
 *
 * Electron 版の rfid_card_mapping_context.tsx を Tauri 2 向けに移植。
 *
 * Electron 版との主な違い:
 * - window.rfidCardMapping.onRfidCardMappingUpdated IPC の代わりに
 *   Tauri の deck_updated イベントを購読する
 * - useCardMappingApi() hook の代わりに api.rfid.getMapping() を使用する
 * - Electron 版の window.electron.ipcRenderer.removeListener は
 *   Tauri の unlisten 関数で代替する
 *
 * 必要な Tauri イベント (Rust 側で emit が必要):
 *   - deck_updated: RfidCardMapping — 現在のデッキ（マッピング）が更新されたときに発火
 */

type RFIDCardMappingContextType = {
  rfidCardMapping: RfidCardMapping | null;
};

const RFIDCardMappingContext = createContext<RFIDCardMappingContextType>({
  rfidCardMapping: null,
});

export const RFIDCardMappingProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [rfidCardMapping, setRfidCardMapping] =
    useState<RfidCardMapping | null>(null);

  useEffect(() => {
    // 初回マウント時にカレントマッピングを取得
    const loadCurrentMapping = async () => {
      try {
        const mapping = await api.rfid.getMapping();
        setRfidCardMapping(mapping);
      } catch (error) {
        // Rust コマンドが未実装の場合はエラーをログ出力のみ
        console.error(
          "[RFIDCardMappingContext] Failed to load current mapping:",
          error,
        );
      }
    };
    void loadCurrentMapping();

    // deck_updated イベントを購読してリアルタイム更新に対応
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;
    api.notifications
      .onDeckUpdated((mapping) => {
        setRfidCardMapping(mapping);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlistenFn = fn;
      })
      .catch((error) => {
        console.error(
          "[RFIDCardMappingContext] Failed to listen deck_updated:",
          error,
        );
      });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  return (
    <RFIDCardMappingContext.Provider value={{ rfidCardMapping }}>
      {children}
    </RFIDCardMappingContext.Provider>
  );
};

export const useRfidCardMapping = () => {
  const context = useContext(RFIDCardMappingContext);
  return context;
};
