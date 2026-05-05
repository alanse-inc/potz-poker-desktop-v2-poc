/**
 * テロップ設定コンテキスト
 *
 * Electron 版の telop_context.tsx を Tauri 2 に移植。
 * HTTP/SSE を Tauri invoke + listen() に置き換え。
 * Rust 側コマンド: get_telop_id / set_telop_id / get_telop_background_color /
 *   set_telop_background_color / get_telop_current_screen / set_telop_current_screen
 * Rust 側イベント: telop_id_updated / telop_background_color_updated / telop_current_screen_updated
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
import type { TelopId, TelopScreenState } from "../types";

type TelopContextType = {
  telopId: TelopId;
  setTelopId: (telopId: TelopId) => Promise<void>;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  backgroundColor: string;
  setBackgroundColor: (color: string) => Promise<void>;
  currentScreen: TelopScreenState;
  setCurrentScreen: (screen: TelopScreenState) => Promise<void>;
};

const TelopContext = createContext<TelopContextType>({
  telopId: "modern",
  setTelopId: async () => {},
  isOpen: false,
  setIsOpen: () => {},
  backgroundColor: "#00ff00",
  setBackgroundColor: async () => {},
  currentScreen: null,
  setCurrentScreen: async () => {},
});

export const TelopProvider = ({ children }: { children: ReactNode }) => {
  const [telopId, setTelopIdState] = useState<TelopId>("modern");
  const [isOpen, setIsOpen] = useState(false);
  const [backgroundColor, setBackgroundColorState] = useState("#00ff00");
  const [currentScreen, setCurrentScreenState] =
    useState<TelopScreenState>(null);

  const setTelopId = useCallback(async (newTelopId: TelopId) => {
    setTelopIdState(newTelopId);
    try {
      await api.telopSettings.setTelopId(newTelopId);
    } catch (error) {
      console.error("[TelopContext] Failed to update telop id", error);
    }
  }, []);

  const setBackgroundColor = useCallback(async (color: string) => {
    setBackgroundColorState(color);
    try {
      await api.telopSettings.setBackgroundColor(color);
    } catch (error) {
      console.error("[TelopContext] Failed to update background color", error);
    }
  }, []);

  const setCurrentScreen = useCallback(async (screen: TelopScreenState) => {
    setCurrentScreenState(screen);
    try {
      await api.telopSettings.setCurrentScreen(screen);
    } catch (error) {
      console.error("[TelopContext] Failed to update current screen", error);
    }
  }, []);

  useEffect(() => {
    // 初期化時に保存済みデータを取得
    const initializeTelopSettings = async () => {
      try {
        const telopIdValue = await api.telopSettings.getTelopId();
        if (telopIdValue) {
          setTelopIdState(telopIdValue);
        }
      } catch {
        // Rust 側未実装の場合は無視
      }

      try {
        const color = await api.telopSettings.getBackgroundColor();
        if (color) {
          setBackgroundColorState(color);
        }
      } catch {
        // Rust 側未実装の場合は無視
      }

      try {
        const screen = await api.telopSettings.getCurrentScreen();
        if (screen !== undefined) {
          setCurrentScreenState(screen);
        }
      } catch {
        // Rust 側未実装の場合は無視
      }
    };

    void initializeTelopSettings();

    // Tauri イベント経由のリアルタイム更新を購読
    let cancelled = false;
    let unlistenTelopId: (() => void) | null = null;
    let unlistenBackgroundColor: (() => void) | null = null;
    let unlistenCurrentScreen: (() => void) | null = null;

    api.notifications
      .onTelopIdUpdated((updatedTelopId) => {
        if (updatedTelopId) {
          setTelopIdState(updatedTelopId);
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlistenTelopId = fn;
      })
      .catch(() => {});

    api.notifications
      .onTelopBackgroundColorUpdated((updatedColor) => {
        setBackgroundColorState(updatedColor);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlistenBackgroundColor = fn;
      })
      .catch(() => {});

    api.notifications
      .onTelopCurrentScreenUpdated((updatedScreen) => {
        setCurrentScreenState(updatedScreen);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlistenCurrentScreen = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlistenTelopId?.();
      unlistenBackgroundColor?.();
      unlistenCurrentScreen?.();
    };
  }, []);

  return (
    <TelopContext.Provider
      value={{
        telopId,
        setTelopId,
        isOpen,
        setIsOpen,
        backgroundColor,
        setBackgroundColor,
        currentScreen,
        setCurrentScreen,
      }}
    >
      {children}
    </TelopContext.Provider>
  );
};

export const useTelop = () => {
  const context = useContext(TelopContext);
  return context;
};
