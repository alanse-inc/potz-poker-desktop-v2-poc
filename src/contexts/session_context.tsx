import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { GameSessionResponse } from "../api/backend";

/**
 * セッションコンテキスト
 *
 * Electron 版の session_context.tsx を Tauri 2 向けに移植。
 * Electron 版は neverthrow ベースの Session ドメイン型を使用していたが、
 * Tauri 版では backend.ts で定義済みの GameSessionResponse を使用する。
 */

type SessionContextValue = {
  currentSession: GameSessionResponse | null;
  setCurrentSession: (session: GameSessionResponse | null) => void;
  currentGameSessionId: string | null;
  setCurrentGameSessionId: (gameSessionId: string | null) => void;
  lastHandNumber: number;
  setLastHandNumber: (handNumber: number) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [currentSession, setCurrentSessionState] =
    useState<GameSessionResponse | null>(null);
  const [currentGameSessionId, setCurrentGameSessionIdState] = useState<
    string | null
  >(null);
  const [lastHandNumber, setLastHandNumberState] = useState<number>(0);

  const setCurrentSession = useCallback(
    (session: GameSessionResponse | null) => {
      setCurrentSessionState(session);
    },
    [],
  );

  const setCurrentGameSessionId = useCallback(
    (gameSessionId: string | null) => {
      setCurrentGameSessionIdState(gameSessionId);
    },
    [],
  );

  const setLastHandNumber = useCallback((handNumber: number) => {
    setLastHandNumberState(handNumber);
  }, []);

  const value = useMemo(
    () => ({
      currentSession,
      setCurrentSession,
      currentGameSessionId,
      setCurrentGameSessionId,
      lastHandNumber,
      setLastHandNumber,
    }),
    [
      currentSession,
      setCurrentSession,
      currentGameSessionId,
      setCurrentGameSessionId,
      lastHandNumber,
      setLastHandNumber,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
