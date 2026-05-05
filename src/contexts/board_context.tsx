import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  // リスナー先・getBoard 後パターン: getBoard 完了後にのみリスナーの更新を反映する
  const initialLoadedRef = useRef(false);

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
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    // リスナーを先に登録し、getBoard 完了後にのみイベントを反映する
    api.notifications
      .onBoardUpdated((updated) => {
        if (!cancelled && initialLoadedRef.current) {
          setBoard(updated ?? null);
          setLoading(false);
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {
        // イベント購読が失敗しても無視
      });

    // リスナー登録後に初期データを取得し、完了後にリスナーを有効化
    api.board
      .getBoard()
      .then((b) => {
        if (!cancelled) {
          setBoard(b);
          initialLoadedRef.current = true;
        }
      })
      .catch(() => {
        // Tauri コマンドが未実装の場合はエラーを無視
        if (!cancelled) {
          setBoard(null);
          initialLoadedRef.current = true;
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      initialLoadedRef.current = false;
      unlisten?.();
    };
  }, []);

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
