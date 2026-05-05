import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SerialStatus } from "../types";
import { useAuth } from "./auth_context";

/**
 * オペレーターコンテキスト
 *
 * Electron 版の operator_context.tsx を Tauri 2 向けに移植。
 *
 * Electron 版との主な違い:
 * - SSE (useSSEConnection) の代わりに Tauri の serial_status_updated イベントを購読
 * - fetchDeviceSerialNumber は invoke("get_serial_status") に置き換え
 * - fetchOperatorMe / fetchGameTable は invoke stub に置き換え
 *   (Rust 側の対応 command が実装されるまでは空振りする)
 *
 * 必要な Tauri command (Rust 側で実装が必要):
 *   - get_operator_me: () -> OperatorResponse
 *   - get_game_table: (operatorId: string, tableId: string) -> GameTableResponse
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** バックエンドのオペレーター情報 */
export type OperatorResponse = {
  operatorId: string;
  auth0Sub: string;
  name: string;
  description: string | null;
};

/** バックエンドのゲームテーブル情報 */
export type GameTableResponse = {
  tableId: string;
  venueId: string;
};

type BackendApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

// ---------------------------------------------------------------------------
// バックエンド呼び出し stub (Rust コマンド未実装のため try/catch で握りつぶす)
// ---------------------------------------------------------------------------

async function fetchOperatorMe(): Promise<BackendApiResult<OperatorResponse>> {
  try {
    const data = await invoke<OperatorResponse>("get_operator_me");
    return { ok: true, data };
  } catch (error) {
    console.error("[OperatorContext] get_operator_me failed:", error);
    return {
      ok: false,
      status: 0,
      message:
        error instanceof Error ? error.message : "get_operator_me failed",
    };
  }
}

async function fetchGameTable(
  operatorId: string,
  tableId: string,
): Promise<BackendApiResult<GameTableResponse>> {
  try {
    const data = await invoke<GameTableResponse>("get_game_table", {
      operatorId,
      tableId,
    });
    return { ok: true, data };
  } catch (error) {
    console.error("[OperatorContext] get_game_table failed:", error);
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "get_game_table failed",
    };
  }
}

async function fetchSerialStatus(): Promise<string | null> {
  try {
    const status = await invoke<SerialStatus>("get_serial_status");
    return status.connected && status.portName ? status.portName : null;
  } catch (error) {
    console.error("[OperatorContext] get_serial_status failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type OperatorContextValue = {
  operator: OperatorResponse | null;
  gameTable: GameTableResponse | null;
  isLoadingOperator: boolean;
  isLoadingGameTable: boolean;
  operatorError: string | null;
  gameTableError: string | null;
  loadGameTable: (tableId: string) => Promise<void>;
};

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const [operator, setOperator] = useState<OperatorResponse | null>(null);
  const [gameTable, setGameTable] = useState<GameTableResponse | null>(null);
  const [isLoadingOperator, setIsLoadingOperator] = useState(false);
  const [isLoadingGameTable, setIsLoadingGameTable] = useState(false);
  // useEffect deps に isLoadingGameTable を含めると再登録ループが起きるため ref で管理
  const isLoadingGameTableRef = useRef(false);
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [gameTableError, setGameTableError] = useState<string | null>(null);

  // サインイン状態が変わったときにオペレーター情報を取得
  useEffect(() => {
    if (!isSignedIn) {
      setOperator(null);
      setGameTable(null);
      return;
    }

    const fetchAll = async () => {
      // 1. operators/me を取得 (stub: get_operator_me)
      setIsLoadingOperator(true);
      setOperatorError(null);
      const operatorResult = await fetchOperatorMe();
      if (!operatorResult.ok) {
        setOperatorError(operatorResult.message);
        console.error(
          `[OperatorContext] fetchOperatorMe failed: ${operatorResult.message} (${operatorResult.status})`,
        );
        setIsLoadingOperator(false);
        return;
      }
      const op = operatorResult.data;
      setOperator(op);
      setIsLoadingOperator(false);

      // 2. シリアルポート接続状態からテーブル ID を取得し、game-table を取得
      const tableId = await fetchSerialStatus();
      if (!tableId) {
        // デバイス未接続の場合は gameTable なしで続行
        return;
      }

      isLoadingGameTableRef.current = true;
      setIsLoadingGameTable(true);
      setGameTableError(null);
      const tableResult = await fetchGameTable(op.operatorId, tableId);
      if (tableResult.ok) {
        setGameTable(tableResult.data);
      } else {
        setGameTableError(tableResult.message);
        console.error(
          `[OperatorContext] fetchGameTable failed: ${tableResult.message} (${tableResult.status})`,
        );
      }
      isLoadingGameTableRef.current = false;
      setIsLoadingGameTable(false);
    };

    void fetchAll();
  }, [isSignedIn]);

  const loadGameTable = useCallback(
    async (tableId: string) => {
      if (!operator) return;

      isLoadingGameTableRef.current = true;
      setIsLoadingGameTable(true);
      setGameTableError(null);
      const result = await fetchGameTable(operator.operatorId, tableId);
      if (result.ok) {
        setGameTable(result.data);
      } else {
        setGameTableError(result.message);
        console.error(
          `[OperatorContext] fetchGameTable failed: ${result.message} (${result.status})`,
        );
      }
      isLoadingGameTableRef.current = false;
      setIsLoadingGameTable(false);
    },
    [operator],
  );

  // Tauri の serial_status_updated イベントを購読してデバイス接続変化に対応
  useEffect(() => {
    if (!operator) return;

    let unlistenFn: (() => void) | null = null;

    listen<SerialStatus>("serial_status_updated", (event) => {
      const status = event.payload;
      if (status.connected && status.portName) {
        if (isLoadingGameTableRef.current) return;
        isLoadingGameTableRef.current = true;
        loadGameTable(status.portName)
          .catch((error) => {
            console.error(
              "[OperatorContext] loadGameTable failed in serial_status_updated handler",
              error,
            );
          })
          .finally(() => {
            isLoadingGameTableRef.current = false;
          });
      } else if (!status.connected) {
        setGameTable(null);
      }
    })
      .then((fn) => {
        unlistenFn = fn;
      })
      .catch((error) => {
        console.error(
          "[OperatorContext] Failed to listen serial_status_updated:",
          error,
        );
      });

    return () => {
      unlistenFn?.();
    };
  }, [operator, loadGameTable]);

  // operator 取得済み + gameTable 未取得の間、定期的にデバイス接続を確認するポーリング
  useEffect(() => {
    if (!operator || gameTable) return;

    let retryCount = 0;
    const MAX_RETRIES = 30;

    const pollDeviceConnection = async () => {
      if (retryCount >= MAX_RETRIES) {
        console.error(
          `[OperatorContext] Device polling stopped after ${MAX_RETRIES} retries`,
        );
        clearInterval(intervalId);
        return;
      }
      if (isLoadingGameTableRef.current) return;
      isLoadingGameTableRef.current = true;
      retryCount++;
      try {
        const tableId = await fetchSerialStatus();
        if (tableId) {
          await loadGameTable(tableId);
        }
      } finally {
        isLoadingGameTableRef.current = false;
      }
    };

    const intervalId = setInterval(() => {
      void pollDeviceConnection();
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [operator, gameTable, loadGameTable]);

  const value = useMemo(
    () => ({
      operator,
      gameTable,
      isLoadingOperator,
      isLoadingGameTable,
      operatorError,
      gameTableError,
      loadGameTable,
    }),
    [
      operator,
      gameTable,
      isLoadingOperator,
      isLoadingGameTable,
      operatorError,
      gameTableError,
      loadGameTable,
    ],
  );

  return (
    <OperatorContext.Provider value={value}>
      {children}
    </OperatorContext.Provider>
  );
}

export function useOperator(): OperatorContextValue {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used within OperatorProvider");
  return ctx;
}
