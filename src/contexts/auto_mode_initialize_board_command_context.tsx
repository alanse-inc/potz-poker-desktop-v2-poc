import { produce } from "immer";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../api/fetch";
import { assignPositions } from "../domain/auto_game/player";
import type {
  AutoModePlayer,
  PlayerIcon,
  TexasHoldemPosition,
} from "../domain/auto_game/types";
import type { PersistedGameSettings } from "../domain/table_name";
import { TableNameSync } from "../domain/table_name";
import { trackClientSideError } from "../features/error_tracker";
import { useSSEConnection } from "../hooks/useSSEConnection";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** プレイヤーの座席番号 (1-9) */
export type PlayerSeatRange = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Auto Mode ボード初期化コマンド */
export interface AutoModeInitializeBoardCommand {
  kind: "initializeBoard";
  input: {
    players: {
      id: string;
      name: string;
      icon?: PlayerIcon;
      position: TexasHoldemPosition | null;
      seat: PlayerSeatRange;
    }[];
    setting: {
      mode: "auto";
      name: string;
    };
  };
}

type AutoModeInitializeBoardCommandContextType = {
  initializeBoardCommand: AutoModeInitializeBoardCommand;
  isStartable: boolean;
  updateInitializeBoardSetting: (
    key: keyof AutoModeInitializeBoardCommand["input"]["setting"],
    value: AutoModeInitializeBoardCommand["input"]["setting"][keyof AutoModeInitializeBoardCommand["input"]["setting"]],
  ) => Promise<void>;
  updatePlayer: (
    player: AutoModeInitializeBoardCommand["input"]["players"][number],
  ) => Promise<void>;
  deletePlayer: (playerId: string) => void;
  setBtnPosition: (seat: PlayerSeatRange) => void;
};

export const AutoModeInitializeBoardCommandContext =
  createContext<AutoModeInitializeBoardCommandContextType>({
    initializeBoardCommand: {
      kind: "initializeBoard",
      input: {
        players: [],
        setting: {
          mode: "auto",
          name: "",
        },
      },
    },
    isStartable: false,
    updateInitializeBoardSetting: async () => {},
    updatePlayer: async () => {},
    deletePlayer: () => {},
    setBtnPosition: () => {},
  });

/**
 * Auto Mode用のゲーム開始前のボードの初期化を行うためのコンテキスト
 * Manual Modeと異なり、スタック管理やブラインド設定は不要
 */
export const AutoModeInitializeBoardCommandProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [initializeBoardCommand, setInitializeBoardCommand] =
    useState<AutoModeInitializeBoardCommand>({
      kind: "initializeBoard",
      input: {
        players: [],
        setting: {
          mode: "auto",
          name: "",
        },
      },
    });

  // 最新の状態を追跡するref（非同期処理でのレースコンディション対策）
  const commandRef = useRef<AutoModeInitializeBoardCommand>(
    initializeBoardCommand,
  );

  // 状態が更新されたらrefも更新
  useEffect(() => {
    commandRef.current = initializeBoardCommand;
  }, [initializeBoardCommand]);

  // 初期値の読み込みと変更監視
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const response = await apiFetch("/api/game-settings");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const savedSettings = await response.json();

        if (savedSettings.type === "success" && savedSettings.value?.autoMode) {
          // Auto Mode用の保存された設定からコマンドを構築
          const autoModeData = savedSettings.value.autoMode;

          // 保存されたプレイヤー情報を復元
          const mappedPlayers = autoModeData.players.map(
            (player: {
              id: string;
              name: string;
              icon: string | null;
              seat: number;
              position: string | null;
            }) => {
              let playerIcon: PlayerIcon | undefined;
              if (player.icon && player.icon.length > 0) {
                playerIcon = player.icon;
              }

              return {
                id: player.id,
                name: player.name,
                icon: playerIcon,
                seat: player.seat as PlayerSeatRange,
                position: player.position as TexasHoldemPosition | null,
              };
            },
          );

          const restoredCommand: AutoModeInitializeBoardCommand = {
            kind: "initializeBoard",
            input: {
              players: mappedPlayers,
              setting: {
                mode: "auto",
                name: autoModeData?.settings?.name ?? "",
              },
            },
          };

          setInitializeBoardCommand(restoredCommand);
        }
        // 保存された設定がない場合は初期状態のまま
      } catch (error) {
        trackClientSideError("Failed to load Auto Mode game settings", {
          cause: error,
        });
        // エラーの場合も初期状態のまま
      }
    };

    loadInitialData();
  }, []);

  /**
   * Auto Modeでのゲーム開始可能条件：
   * - プレイヤーが2人以上いる
   * - BTNのプレイヤーが設定されている（2人プレイの場合はbtn_sb）
   */
  const isStartable = useMemo(() => {
    const hasBtnPosition = initializeBoardCommand.input.players.some(
      (player) => player.position === "btn" || player.position === "btn_sb",
    );

    return initializeBoardCommand.input.players.length >= 2 && hasBtnPosition;
  }, [initializeBoardCommand.input.players]);

  // 設定値の更新（即座に /api/game-settings に保存）
  const updateInitializeBoardSetting = useCallback(
    async <K extends keyof AutoModeInitializeBoardCommand["input"]["setting"]>(
      key: K,
      value: AutoModeInitializeBoardCommand["input"]["setting"][K],
    ) => {
      const updatedCommand = produce(initializeBoardCommand, (draft) => {
        draft.input.setting[key] = value;
      });

      // ローカル状態を即座に更新（レスポンシブに）
      setInitializeBoardCommand(updatedCommand);

      // Auto Modeのトーナメント名はサーバーに保存
      if (key === "name") {
        try {
          // 既存の設定を読み込む
          const response = await apiFetch("/api/game-settings");
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const result = await response.json();

          if (result.type !== "success" || !result.value) {
            throw new Error("Failed to fetch game settings");
          }

          const existingSettings = result.value satisfies PersistedGameSettings;

          // ドメインサービスを使用して設定を更新
          // テーブル名はAuto/Manual両モードで共有する（ビジネスルール）
          const updateResult = TableNameSync.syncTableName(
            existingSettings,
            value as string,
          );

          if (!updateResult.ok) {
            throw updateResult.error;
          }

          const updatedSettings = updateResult.value;

          // 保存
          const saveResponse = await apiFetch("/api/game-settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedSettings),
          });

          if (!saveResponse.ok) {
            throw new Error(`HTTP error! status: ${saveResponse.status}`);
          }

          const saveResult = await saveResponse.json();
          if (saveResult.type !== "success") {
            throw new Error("Failed to save game settings");
          }
        } catch (error) {
          trackClientSideError(`Failed to save Auto Mode ${key}`, {
            cause: error,
          });
        }
      }
    },
    [initializeBoardCommand],
  );

  // SSEイベントリスナー：Auto Modeからの設定・プレイヤー変更を監視（SSE駆動）
  // Tauri版では auto-mode-initial-board-updated イベントは未サポート
  // game-settings-updated イベントのみ処理する
  const handleSSEEvent = useCallback(() => {
    // Tauri版では auto-mode-initial-board-updated / game-settings-updated 経由の
    // 自動同期は未サポート。将来的にTauriイベントを追加した際にここを実装する。
    console.log(
      "[AutoModeInitializeBoardCommandContext] SSE event received (no-op in Tauri)",
    );
  }, []);

  // SSE接続を確立してイベントをリッスン
  useSSEConnection(handleSSEEvent);

  // プレーヤー情報の更新
  const updatePlayer = useCallback(
    async (
      player: AutoModeInitializeBoardCommand["input"]["players"][number],
    ) => {
      // 現在の状態を取得してバリデーション
      const current = commandRef.current;

      // ID重複チェック
      const currentPlayers = current.input.players;
      const isIdDuplicate = currentPlayers.some(
        (existingPlayer) =>
          existingPlayer.seat !== player.seat &&
          existingPlayer.id === player.id,
      );
      if (isIdDuplicate) {
        trackClientSideError("プレーヤーのIDが重複しています");
        return;
      }

      // 1. 新しいコマンドを作成（純粋な計算）
      const updatedCommand = produce(current, (draft) => {
        // 更新前のプレイヤー状態を取得
        const originalPlayer = draft.input.players.find(
          (p) => p.seat === player.seat,
        );

        // プレイヤーが新規追加の場合はポジションをリセット
        if (!originalPlayer) {
          for (let i = 0; i < draft.input.players.length; i++) {
            draft.input.players[i] = {
              ...draft.input.players[i],
              position: null,
            };
          }
        }

        const playerIndex = draft.input.players.findIndex(
          (p) => p.seat === player.seat,
        );

        if (playerIndex >= 0) {
          // 既存プレイヤーの更新
          draft.input.players[playerIndex] = player;
        } else {
          // 新規プレイヤーの追加
          draft.input.players.push(player);
        }
      });

      // 2. 状態を同期的に更新（副作用なし）
      setInitializeBoardCommand(updatedCommand);

      // commandRefから最新の状態を取得（レースコンディション対策）
      const latestCommand = commandRef.current;

      try {
        // 既存の設定を読み込む
        const response = await apiFetch("/api/game-settings");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();

        if (result.type !== "success" || !result.value) {
          throw new Error("Failed to fetch game settings");
        }

        const existingSettings = result.value satisfies PersistedGameSettings;

        // Auto Modeのプレイヤー情報を更新（最新の状態を使用）
        const updatedSettings: PersistedGameSettings = {
          ...existingSettings,
          autoMode: {
            ...existingSettings.autoMode,
            players: latestCommand.input.players.map((p) => ({
              id: p.id,
              name: p.name,
              icon: p.icon ?? null,
              seat: p.seat,
              position: p.position,
            })),
            settings: existingSettings.autoMode?.settings ?? {
              name: "",
            },
            btnPlayerId: existingSettings.autoMode?.btnPlayerId ?? null,
          },
        };

        // 保存
        const saveResponse = await apiFetch("/api/game-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedSettings),
        });

        if (!saveResponse.ok) {
          throw new Error(`HTTP error! status: ${saveResponse.status}`);
        }

        const saveResult = await saveResponse.json();
        if (saveResult.type !== "success") {
          throw new Error("Failed to save game settings");
        }
      } catch (error) {
        trackClientSideError("Failed to save Auto Mode player data", {
          cause: error,
        });
      }
    },
    [],
  );

  // プレーヤーの削除
  const deletePlayer = useCallback((playerId: string) => {
    // 現在の状態を取得
    const current = commandRef.current;

    // ステップ1: 削除前の状態でpositionResetPlayersを構築（削除時は常に全プレイヤーのポジションをリセット）
    const positionResetPlayers = current.input.players.map((p) => ({
      ...p,
      position: null,
    }));

    // 1. 新しいコマンドを作成（純粋な計算）
    const updatedCommand = produce(current, (draft) => {
      // ポジションリセット
      for (let i = 0; i < draft.input.players.length; i++) {
        draft.input.players[i] = {
          ...draft.input.players[i],
          position: null,
        };
      }

      // プレイヤーを削除
      draft.input.players = draft.input.players.filter(
        (player) => player.id !== playerId,
      );
    });

    // 2. 状態を同期的に更新（副作用なし）
    setInitializeBoardCommand(updatedCommand);

    // 非同期処理用のスナップショットを保存
    const positionResetPlayersSnapshot = positionResetPlayers;
    const settingSnapshot = updatedCommand.input.setting;

    // 非同期処理はsetState外で実行（レースコンディション対策）
    // サーバー側でプレイヤーを削除（ボード状態を更新）
    (async () => {
      try {
        const response = await apiFetch("/api/initial-board/player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "editPlayer",
            input: {
              board: {
                players: positionResetPlayersSnapshot,
                setting: settingSnapshot,
              },
              playerId: playerId,
              player: null, // null でプレイヤー削除操作を示唆
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.type !== "success") {
          throw new Error("Failed to delete player");
        }
      } catch (error) {
        trackClientSideError("Failed to delete player on server", {
          cause: error,
        });
      }
    })();

    // ゲーム設定にもプレイヤー情報を保存（Mode switch時の同期用）
    (async () => {
      try {
        const gameSettingsResponse = await apiFetch("/api/game-settings");
        if (!gameSettingsResponse.ok) {
          throw new Error(`HTTP error! status: ${gameSettingsResponse.status}`);
        }
        const gameSettingsResult = await gameSettingsResponse.json();

        if (
          gameSettingsResult.type !== "success" ||
          !gameSettingsResult.value
        ) {
          throw new Error("Failed to fetch game settings");
        }

        const existingSettings =
          gameSettingsResult.value satisfies PersistedGameSettings;

        // commandRefから最新の状態を取得
        const latestCommand = commandRef.current;

        // Auto Mode と Manual Mode のプレイヤー情報を更新
        const updatedGameSettings: PersistedGameSettings = {
          ...existingSettings,
          autoMode: {
            players: latestCommand.input.players.map((p) => ({
              id: p.id,
              name: p.name,
              icon: p.icon ?? null,
              seat: p.seat,
              position: p.position,
            })),
            settings: existingSettings.autoMode.settings,
            btnPlayerId: existingSettings.autoMode.btnPlayerId,
          },
          manualMode: {
            players: latestCommand.input.players.map((autoPlayer) => {
              const manualPlayer = existingSettings.manualMode?.players.find(
                (p: PersistedGameSettings["manualMode"]["players"][number]) =>
                  p.id === autoPlayer.id,
              );
              return {
                id: autoPlayer.id,
                name: autoPlayer.name,
                icon: autoPlayer.icon ?? null,
                seat: autoPlayer.seat,
                position: autoPlayer.position,
                status: manualPlayer?.status ?? "active",
                stack: manualPlayer?.stack ?? 0,
              };
            }),
            settings: existingSettings.manualMode?.settings ?? {
              name: "",
              miniChip: 1,
              smallBlind: 0,
              bigBlind: 0,
              anteRule: "none",
              blindExceptionRule: "dead_button",
            },
            btnPlayerId: existingSettings.manualMode?.btnPlayerId ?? null,
          },
        };

        // ゲーム設定を保存
        const saveResponse = await apiFetch("/api/game-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedGameSettings),
        });

        if (!saveResponse.ok) {
          throw new Error(`HTTP error! status: ${saveResponse.status}`);
        }

        const saveResult = await saveResponse.json();
        if (saveResult.type !== "success") {
          throw new Error("Failed to save game settings");
        }
      } catch (gameSettingsError) {
        trackClientSideError(
          "Failed to save game settings after player deletion",
          {
            cause: gameSettingsError,
          },
        );
      }
    })();
  }, []);

  // BTN位置を設定（全ポジションを自動割り当て）
  const setBtnPosition = useCallback((seat: PlayerSeatRange) => {
    // 現在の状態を取得
    const current = commandRef.current;

    // 指定されたシートのプレイヤーを取得
    const btnPlayer = current.input.players.find((p) => p.seat === seat);
    if (!btnPlayer) {
      trackClientSideError("BTN player not found for seat");
      return;
    }

    if (!btnPlayer.id || btnPlayer.id.length === 0) {
      trackClientSideError("Failed to create BTN player ID");
      return;
    }

    // 現在のプレイヤーをAutoModePlayer型に変換
    const autoModePlayers: AutoModePlayer[] = current.input.players.map(
      (p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon ?? null,
        hand: [],
        position: null,
        action: null,
        seat: p.seat,
        odds: null,
      }),
    );

    // assignPositions を使って全ポジションを割り当て
    // Tauri版のシグネチャ: assignPositions(players, btnPlayerId)
    const playersWithPositions = assignPositions(autoModePlayers, btnPlayer.id);

    // AutoModeInitializeBoardCommand の players 型に変換
    const updatedPlayers = playersWithPositions.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon ?? undefined,
      seat: p.seat as PlayerSeatRange,
      position: p.position,
    }));

    // 1. 新しいコマンドを作成（純粋な計算）
    const updatedCommand = produce(current, (draft) => {
      draft.input.players = updatedPlayers;
    });

    // 2. 状態を同期的に更新（副作用なし）
    setInitializeBoardCommand(updatedCommand);

    // 非同期処理用にローカル変数にコピー（型推論のため）
    const btnPlayerData = {
      id: btnPlayer.id,
      name: btnPlayer.name,
      icon: btnPlayer.icon,
      seat: btnPlayer.seat,
    };
    const updatedPlayersData = updatedPlayers;
    const settingData = updatedCommand.input.setting;

    // 非同期処理はsetState外で実行（レースコンディション対策）
    // HTTP API経由でBTN設定を送信
    (async () => {
      try {
        const editPlayerCommand = {
          kind: "editPlayer",
          input: {
            board: {
              players: updatedPlayersData,
              setting: settingData,
            },
            playerId: btnPlayerData.id,
            player: {
              name: btnPlayerData.name,
              icon: btnPlayerData.icon ?? null,
              seat: btnPlayerData.seat,
              position: "btn" as const,
            },
          },
        };

        const response = await apiFetch("/api/initial-board/player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editPlayerCommand),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.type !== "success") {
          throw new Error("Failed to set BTN position");
        }
      } catch (error) {
        trackClientSideError("Failed to set BTN position", {
          cause: error,
        });
      }
    })();
  }, []);

  const value = useMemo(
    () => ({
      initializeBoardCommand,
      isStartable,
      updateInitializeBoardSetting,
      updatePlayer,
      deletePlayer,
      setBtnPosition,
    }),
    [
      initializeBoardCommand,
      isStartable,
      updateInitializeBoardSetting,
      updatePlayer,
      deletePlayer,
      setBtnPosition,
    ],
  );

  return (
    <AutoModeInitializeBoardCommandContext.Provider value={value}>
      {children}
    </AutoModeInitializeBoardCommandContext.Provider>
  );
};

export const useAutoModeInitializeBoardCommand = () => {
  const context = useContext(AutoModeInitializeBoardCommandContext);
  return context;
};
