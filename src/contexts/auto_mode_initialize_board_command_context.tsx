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
import { TauriGameSettingsGateway } from "../port/game_settings_gateway";

const gameSettingsGateway = new TauriGameSettingsGateway();

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
      const settingsResult = await gameSettingsGateway.get();
      if (settingsResult.isErr()) {
        trackClientSideError("Failed to load Auto Mode game settings", {
          cause: settingsResult.error,
        });
        return;
      }

      const savedSettings = settingsResult.value;
      if (savedSettings?.autoMode) {
        const autoModeData = savedSettings.autoMode;

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

      if (key === "name") {
        try {
          const getResult = await gameSettingsGateway.get();
          if (getResult.isErr()) {
            throw getResult.error;
          }
          const existingSettings = getResult.value;
          if (!existingSettings) {
            throw new Error("Failed to fetch game settings");
          }

          const updateResult = TableNameSync.syncTableName(
            existingSettings,
            value as string,
          );

          if (!updateResult.ok) {
            throw updateResult.error;
          }

          const saveResult = await gameSettingsGateway.save(updateResult.value);
          if (saveResult.isErr()) {
            throw saveResult.error;
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

  // SSEイベントリスナー：Tauri版では auto-mode-initial-board-updated イベントは未サポート
  // 将来的にTauriイベントを追加した際にここを実装する。
  const handleSSEEvent = useCallback(() => {
    // Tauri版では auto-mode-initial-board-updated 経由の自動同期は未サポート。
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

      // setInitializeBoardCommand は非同期スケジュールのため、commandRef.current は次レンダリング後まで
      // 更新されない。updatedCommand（ローカル変数）を直接使うことで stale 参照を回避する。
      const latestCommand = updatedCommand;

      try {
        const getResult = await gameSettingsGateway.get();
        if (getResult.isErr()) {
          throw getResult.error;
        }
        const existingSettings = getResult.value;
        if (!existingSettings) {
          throw new Error("Failed to fetch game settings");
        }

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

        const saveResult = await gameSettingsGateway.save(updatedSettings);
        if (saveResult.isErr()) {
          throw saveResult.error;
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

    // Tauri 環境では HTTP サーバーは稼働していないため、
    // gameSettingsGateway 経由で Tauri Store を直接更新する。
    (async () => {
      try {
        const getResult = await gameSettingsGateway.get();
        if (getResult.isErr()) {
          throw getResult.error;
        }
        const existingSettings = getResult.value;
        if (!existingSettings) {
          throw new Error("Failed to fetch game settings");
        }

        // updatedCommand はローカル変数のため stale にならない
        const latestCommand = updatedCommand;

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

        const saveResult = await gameSettingsGateway.save(updatedGameSettings);
        if (saveResult.isErr()) {
          throw saveResult.error;
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

    // Tauri 環境では HTTP サーバーは稼働していないため、
    // gameSettingsGateway 経由で Tauri Store を直接更新する。
    (async () => {
      try {
        const getResult = await gameSettingsGateway.get();
        if (getResult.isErr()) {
          throw getResult.error;
        }
        const existingSettings = getResult.value;
        if (!existingSettings) {
          throw new Error("Failed to fetch game settings");
        }

        const updatedSettings: PersistedGameSettings = {
          ...existingSettings,
          autoMode: {
            ...existingSettings.autoMode,
            players: updatedCommand.input.players.map((p) => ({
              id: p.id,
              name: p.name,
              icon: p.icon ?? null,
              seat: p.seat,
              position: p.position,
            })),
            settings: existingSettings.autoMode?.settings ?? {
              name: "",
            },
            btnPlayerId: btnPlayer.id,
          },
        };

        const saveResult = await gameSettingsGateway.save(updatedSettings);
        if (saveResult.isErr()) {
          throw saveResult.error;
        }
      } catch (error) {
        trackClientSideError("Failed to save BTN position", {
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
