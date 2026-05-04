import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "../api/client";
import type { TexasHoldemBoard } from "../types";

type BoardContextValue = {
  board: TexasHoldemBoard | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<TexasHoldemBoard | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const b = await api.board.getBoard();
      setBoard(b);
    } catch {
      // Tauri コマンドが未実装の場合はエラーを無視
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    let unlisten: (() => void) | null = null;

    api.notifications
      .onBoardUpdated((updated) => {
        setBoard(updated);
        setLoading(false);
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // イベント購読が失敗しても無視
      });

    return () => {
      unlisten?.();
    };
  }, [refresh]);

  return (
    <BoardContext.Provider value={{ board, loading, refresh }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) {
    throw new Error("useBoard must be used within BoardProvider");
  }
  return ctx;
}
