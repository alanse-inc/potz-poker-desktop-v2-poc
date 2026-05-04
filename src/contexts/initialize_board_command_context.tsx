/**
 * InitializeBoardCommandContext (Manual Mode)
 *
 * Electron 版の initialize_board_command_context.tsx (1243 行) を Tauri 2 に移植。
 *
 * 変換点:
 *   - window.initializeCommand.* / window.board.* → Tauri invoke() / listen()
 *   - SSE (useSSEConnection) → Tauri listen() via api.notifications
 *   - apiFetch → src/api/fetch.ts の apiFetch (Hono ローカルサーバー向け)
 *   - trackClientSideError → console.error で代替 (Tauri 版未実装)
 *   - domain 型: TexasHoldemPosition/PlayerIcon は domain/auto_game/types から借用
 *   - ManualModeInitializeBoardCommand / PlayerSeatRange / PlayerStatus は本ファイルで定義
 *   - getPositionsByPlayerCount は本ファイルで定義 (Electron 版と同等ロジック)
 *   - TableNameSync / PersistedGameSettings は src/domain/table_name.ts から借用
 *
 * 必要な Tauri コマンド (Rust 実装待ち):
 *   - get_initial_board_command   : 初期コマンドの取得
 *   - set_initial_board_command   : 初期コマンドの保存 (IPC 同期用)
 *
 * 必要な Tauri イベント (Rust 実装待ち):
 *   - initial_board_command_updated : 他プロセスから初期コマンドが更新されたとき
 *
 * 現状 Tauri コマンド/イベントは stub 実装 (ログのみ)。
 * HTTP API (/api/game-settings, /api/initial-board/player) は apiFetch で呼び出す。
 */

import { produce } from "immer";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch } from "../api/fetch";
import type {
  PlayerIcon,
  TexasHoldemPosition,
} from "../domain/auto_game/types";
import { RESERVED_GUEST_PLAYER_IDS } from "../domain/guest_player";
import {
  type BlindExceptionRule,
  type PersistedGameSettings,
  TableNameSync,
} from "../domain/table_name";

// ---------------------------------------------------------------------------
// 型定義 (Electron 版 domain/player.ts / workflow/command.ts 相当)
// ---------------------------------------------------------------------------

/** Manual Mode でのプレイヤー状態 */
export type ManualPlayerStatus = "active" | "leaved" | "bust";

/** 座席番号 (1〜9) */
export type PlayerSeatRange = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** neverthrow の ok 相当 - NewPlayerIcon の代替 */
export function NewPlayerIcon(icon: string): {
  isOk(): boolean;
  value: PlayerIcon;
  _unsafeUnwrap(): PlayerIcon;
} {
  return {
    isOk: () => icon.length > 0,
    value: icon as PlayerIcon,
    _unsafeUnwrap: () => icon as PlayerIcon,
  };
}

/** anteRule */
export type AnteRule = "none" | "bbante";

/** Manual Mode ゲーム開始前ボード初期化コマンド */
export interface ManualModeInitializeBoardCommand {
  kind: "initializeBoard";
  startingHandNumber?: number;
  input: {
    players: {
      id: string;
      name: string;
      icon?: PlayerIcon;
      status: ManualPlayerStatus;
      stack: number;
      position: TexasHoldemPosition | null;
      seat: PlayerSeatRange;
    }[];
    setting: {
      mode: "manual";
      name: string;
      miniChip: number;
      smallBlind: number;
      bigBlind: number;
      anteRule: AnteRule;
      blindExceptionRule: BlindExceptionRule;
    };
  };
}

// ---------------------------------------------------------------------------
// ドメインロジック (Electron 版 domain/texas_holdem/position.ts 相当)
// ---------------------------------------------------------------------------

/**
 * プレイヤー数に応じたポジション配列を返す (BTNから時計回り順)
 */
function getPositionsByPlayerCount(playerCount: number): TexasHoldemPosition[] {
  switch (playerCount) {
    case 3:
      return ["btn", "sb", "bb"];
    case 4:
      return ["btn", "sb", "bb", "co"];
    case 5:
      return ["btn", "sb", "bb", "utg", "co"];
    case 6:
      return ["btn", "sb", "bb", "utg", "hj", "co"];
    case 7:
      return ["btn", "sb", "bb", "utg", "utg_plus_1", "hj", "co"];
    case 8:
      return ["btn", "sb", "bb", "utg", "utg_plus_1", "utg_plus_2", "hj", "co"];
    case 9:
      return [
        "btn",
        "sb",
        "bb",
        "utg",
        "utg_plus_1",
        "utg_plus_2",
        "utg_plus_3",
        "hj",
        "co",
      ];
    case 10:
      return [
        "btn",
        "sb",
        "bb",
        "utg",
        "utg_plus_1",
        "utg_plus_2",
        "utg_plus_3",
        "mp",
        "hj",
        "co",
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// エラー追跡 (Tauri 版: console.error で代替)
// ---------------------------------------------------------------------------

function trackClientSideError(
  message: string,
  extra?: Record<string, unknown>,
) {
  console.error("[initialize_board_command_context]", message, extra ?? "");
}

// ---------------------------------------------------------------------------
// Context 型
// ---------------------------------------------------------------------------

type InitializeBoardCommandContextType = {
  initializeBoardCommand: ManualModeInitializeBoardCommand;
  isStartable: boolean;
  updateInitializeBoardSetting: (
    key: keyof ManualModeInitializeBoardCommand["input"]["setting"],
    value: ManualModeInitializeBoardCommand["input"]["setting"][keyof ManualModeInitializeBoardCommand["input"]["setting"]],
  ) => void;
  updatePlayer: (
    player: ManualModeInitializeBoardCommand["input"]["players"][number],
  ) => void;
  deletePlayer: (playerId: string) => void;
  updateInitializeBoardSettingForDevelopment: () => void;
};

// ---------------------------------------------------------------------------
// 初期値
// ---------------------------------------------------------------------------

const DEFAULT_COMMAND: ManualModeInitializeBoardCommand = {
  kind: "initializeBoard",
  input: {
    players: [],
    setting: {
      mode: "manual",
      name: "",
      miniChip: 0,
      smallBlind: 0,
      bigBlind: 0,
      anteRule: "none",
      blindExceptionRule: "dead_button",
    },
  },
};

export const InitializeBoardCommandContext =
  createContext<InitializeBoardCommandContextType>({
    initializeBoardCommand: DEFAULT_COMMAND,
    isStartable: false,
    updateInitializeBoardSetting: () => {},
    updatePlayer: () => {},
    deletePlayer: () => {},
    updateInitializeBoardSettingForDevelopment: () => {},
  });

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * ゲーム開始前のボードの初期化を行うためのコンテキスト
 * 設定は複数ページにまたがるので、ここで状態を管理する
 */
export const InitializeBoardCommandProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [initializeBoardCommand, setInitializeBoardCommand] =
    useState<ManualModeInitializeBoardCommand>(DEFAULT_COMMAND);

  // Desktop/Web共通：初期値の読み込みと変更監視
  useEffect(() => {
    const loadInitialData = async () => {
      // 保存された設定を読み込む（HTTP API経由）
      try {
        const response = await apiFetch("/api/game-settings");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const savedSettings = await response.json();

        if (
          savedSettings.type === "success" &&
          savedSettings.value?.manualMode
        ) {
          // Manual Mode用の保存された設定からコマンドを構築
          const manualModeData = savedSettings.value.manualMode;

          // プレイヤー情報を復元（保存されたポジション情報を使用）
          const players = manualModeData.players.map(
            (p: {
              id: string;
              name: string;
              icon: string | null;
              status: string;
              stack: number;
              seat: number;
              position: string | null;
            }) => {
              const icon =
                p.icon === null ? undefined : (p.icon as unknown as PlayerIcon);
              const seat = p.seat as PlayerSeatRange;
              return {
                id: p.id,
                name: p.name,
                icon,
                status: p.status as ManualPlayerStatus,
                stack: p.stack,
                seat,
                position: p.position as TexasHoldemPosition | null,
              };
            },
          );

          const restoredCommand: ManualModeInitializeBoardCommand = {
            kind: "initializeBoard",
            input: {
              players,
              setting: {
                mode: "manual",
                name: manualModeData.settings?.name ?? "",
                miniChip: manualModeData.settings?.miniChip ?? 0,
                smallBlind: manualModeData.settings?.smallBlind ?? 0,
                bigBlind: manualModeData.settings?.bigBlind ?? 0,
                anteRule: manualModeData.settings?.anteRule ?? "none",
                blindExceptionRule:
                  manualModeData.settings?.blindExceptionRule ?? "dead_button",
              },
            },
          };
          setInitializeBoardCommand(restoredCommand);

          // Tauri コマンドへの通知 (stub: 未実装コマンドはログのみ)
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("set_initial_board_command", {
              command: restoredCommand,
            });
          } catch {
            // コマンド未実装のため無視
          }
        } else {
          // 保存された設定がない場合は Tauri コマンドから取得を試みる
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const command =
              await invoke<ManualModeInitializeBoardCommand | null>(
                "get_initial_board_command",
              );
            if (command) {
              setInitializeBoardCommand(command);
            }
          } catch {
            // コマンド未実装のため無視
          }
        }
      } catch (error) {
        trackClientSideError("Failed to load game settings", {
          cause: error,
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
        });
        // エラーの場合も Tauri コマンドから取得を試みる
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const command = await invoke<ManualModeInitializeBoardCommand | null>(
            "get_initial_board_command",
          );
          if (command) {
            setInitializeBoardCommand(command);
          }
        } catch {
          // コマンド未実装のため無視
        }
      }
    };

    loadInitialData();

    // Tauri イベント経由で初期化コマンドの更新を監視
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event")
      .then(({ listen }) => {
        return listen<ManualModeInitializeBoardCommand>(
          "initial_board_command_updated",
          (event) => {
            setInitializeBoardCommand(event.payload);
          },
        );
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // イベント未実装のため無視
      });

    return () => {
      unlisten?.();
    };
  }, []);

  // もしすでにボードが存在していたら、それをもとにinitializeBoardCommandを作成する
  // (Electron 版の window.board.getBoard() 相当を apiFetch で代替)
  useEffect(() => {
    const loadBoard = async () => {
      try {
        const response = await apiFetch("/api/board");
        if (!response.ok) return;
        const result = await response.json();
        if (result.type === "success" && result.value) {
          const board = result.value;
          setInitializeBoardCommand({
            kind: "initializeBoard",
            input: {
              players: board.players.map(
                (player: {
                  id: string;
                  name: string;
                  icon?: string | null;
                  status: ManualPlayerStatus;
                  stack: number;
                  position: TexasHoldemPosition | null;
                  seat: PlayerSeatRange;
                }) => ({
                  id: player.id,
                  name: player.name,
                  icon: player.icon ?? undefined,
                  status: player.status,
                  stack: player.stack,
                  position: player.position,
                  seat: player.seat,
                }),
              ),
              setting: board.setting,
            },
          });
        }
      } catch {
        // ボードが存在しない場合は無視
      }
    };
    loadBoard();
  }, []);

  // 設定値の更新（即座に /api/game-settings に保存）
  const updateInitializeBoardSetting = useCallback(
    async <
      K extends keyof ManualModeInitializeBoardCommand["input"]["setting"],
    >(
      key: K,
      value: ManualModeInitializeBoardCommand["input"]["setting"][K],
    ) => {
      const updatedCommand = produce(initializeBoardCommand, (draft) => {
        draft.input.setting[key] = value;
      });
      // ローカルも即座に更新（レスポンシブに）
      setInitializeBoardCommand(updatedCommand);

      // 設定値の変更時は即座に /api/game-settings に保存
      if (
        key === "name" ||
        key === "miniChip" ||
        key === "smallBlind" ||
        key === "bigBlind" ||
        key === "anteRule" ||
        key === "blindExceptionRule"
      ) {
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

          const existingSettings = result.value as PersistedGameSettings;

          // ドメインサービスを使用して設定を更新
          const updateResult =
            key === "name"
              ? TableNameSync.syncTableName(existingSettings, value as string)
              : TableNameSync.updateManualModeSetting(
                  existingSettings,
                  key as Exclude<
                    keyof PersistedGameSettings["manualMode"]["settings"],
                    "name"
                  >,
                  value as PersistedGameSettings["manualMode"]["settings"][Exclude<
                    keyof PersistedGameSettings["manualMode"]["settings"],
                    "name"
                  >],
                );

          if (!updateResult.ok) {
            throw new Error("Failed to update settings");
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
          trackClientSideError(`Failed to save ${key}`, {
            cause: error,
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
          });
        }
      }
    },
    [initializeBoardCommand],
  );

  /**
   * ゲーム開始可能かどうかを管理する
   *
   * - アクティブなプレイヤーが2人以上いる
   * - BTNのプレイヤーが設定されている
   * - 通常時：SB, BB が設定されている
   * - one big適用時：BBのみ設定されている（SBは不要）
   * - アクティブなプレーヤーのSTACKがMINI CHIP以上
   */
  const isStartable = useMemo(() => {
    const activePlayers = initializeBoardCommand.input.players.filter(
      (player) => player.status === "active",
    );

    // one bigが適用されているかチェック
    const hasBtnPosition = initializeBoardCommand.input.players.some(
      (player) => player.position === "btn" || player.position === "btn_sb",
    );
    const hasSbPosition = activePlayers.some(
      (player) => player.position === "sb" || player.position === "btn_sb",
    );
    const hasBbPosition = activePlayers.some(
      (player) => player.position === "bb",
    );
    const isOneBigApplied = hasBtnPosition && !hasSbPosition && hasBbPosition;

    // ポジションバリデーション
    const positionsValid = isOneBigApplied
      ? hasBtnPosition && hasBbPosition
      : hasBtnPosition && hasSbPosition && hasBbPosition;

    return (
      activePlayers.length >= 2 &&
      positionsValid &&
      initializeBoardCommand.input.setting.smallBlind > 0 &&
      initializeBoardCommand.input.setting.bigBlind > 0 &&
      activePlayers.every(
        (player) =>
          player.stack >= initializeBoardCommand.input.setting.miniChip,
      )
    );
  }, [
    initializeBoardCommand.input.players,
    initializeBoardCommand.input.setting.bigBlind,
    initializeBoardCommand.input.setting.miniChip,
    initializeBoardCommand.input.setting.smallBlind,
  ]);

  /**
   * BTNから次のアクティブプレイヤーまでの間にbustプレイヤーがいるかチェック
   */
  const hasBustBetweenBtnAndNextActive = (
    players: ManualModeInitializeBoardCommand["input"]["players"],
    btnSeat: number,
  ): boolean => {
    for (let i = 1; i <= 9; i++) {
      const checkSeat = ((btnSeat - 1 + i) % 9) + 1;
      const player = players.find((p) => p.seat === checkSeat);

      if (player) {
        if (player.status === "active") {
          return false;
        }
        if (player.status === "bust") {
          return true;
        }
      }
    }
    return false;
  };

  /**
   * 初回ゲーム開始時にone_bigルールを適用すべきか判定する
   */
  const shouldApplyOneBigForInitialGame = (
    players: ManualModeInitializeBoardCommand["input"]["players"],
    btnPlayer: ManualModeInitializeBoardCommand["input"]["players"][number],
    blindExceptionRule: BlindExceptionRule,
  ): boolean => {
    if (blindExceptionRule !== "dead_button") {
      return false;
    }
    return hasBustBetweenBtnAndNextActive(players, btnPlayer.seat);
  };

  /**
   * BTN、SB、BBを除いたポジション配列を生成
   */
  const getPositionsExcludingBlindPositions = (
    activePlayerCount: number,
  ): TexasHoldemPosition[] => {
    const fullPositions = getPositionsByPlayerCount(activePlayerCount + 1);
    return fullPositions.filter(
      (pos) => pos !== "btn" && pos !== "sb" && pos !== "bb",
    );
  };

  // プレーヤー情報の更新
  const updatePlayer = (
    player: ManualModeInitializeBoardCommand["input"]["players"][number],
  ) => {
    // ID重複チェック
    const currentPlayers = initializeBoardCommand.input.players;
    const isIdDuplicate = currentPlayers.some(
      (existingPlayer) =>
        existingPlayer.seat !== player.seat && existingPlayer.id === player.id,
    );
    if (isIdDuplicate) {
      trackClientSideError("プレーヤーのIDが重複しています");
      return;
    }

    const updatedCommand = produce(initializeBoardCommand, (draft) => {
      const originalPlayer = draft.input.players.find(
        (p) => p.seat === player.seat,
      );

      // --- 状態変化フラグ ---
      const isBecomingLeaved =
        player.status === "leaved" &&
        (!originalPlayer || originalPlayer.status !== "leaved");
      const isBecomingActive =
        player.status === "active" &&
        (!originalPlayer || originalPlayer.status !== "active");
      const isBecomingBtn =
        player.position === "btn" &&
        player.status !== "leaved" &&
        (!originalPlayer || originalPlayer.position !== "btn");
      const isNewUser = !originalPlayer && player.status === "active";

      // --- ポジションリセット処理 ---
      if (isBecomingLeaved) {
        for (let i = 0; i < draft.input.players.length; i++) {
          draft.input.players[i] = {
            ...draft.input.players[i],
            position: null,
          };
        }
      } else if (isBecomingActive || isNewUser) {
        for (let i = 0; i < draft.input.players.length; i++) {
          draft.input.players[i] = {
            ...draft.input.players[i],
            position: null,
          };
        }
      } else if (isBecomingBtn) {
        for (let i = 0; i < draft.input.players.length; i++) {
          if (draft.input.players[i].id !== player.id) {
            draft.input.players[i] = {
              ...draft.input.players[i],
              position: null,
            };
          }
        }
      }
      // --- リセット処理ここまで ---

      // --- プレイヤー情報の更新 ---
      const updatedPlayer =
        player.status === "leaved" ? { ...player, position: null } : player;

      const playerIndex = draft.input.players.findIndex(
        (p) => p.seat === updatedPlayer.seat,
      );

      if (playerIndex >= 0) {
        draft.input.players[playerIndex] = updatedPlayer;
      } else {
        draft.input.players.push(updatedPlayer);
      }
      // --- プレイヤー情報更新ここまで ---

      // --- SB/BB 自動設定 (BTNが新たに設定された場合のみ) ---
      if (isBecomingBtn) {
        const activePlayers = draft.input.players
          .filter((p) => p.status === "active")
          .sort((a, b) => a.seat - b.seat);

        const btnPlayerInDraft = draft.input.players.find(
          (p) => p.id === updatedPlayer.id,
        );

        if (
          btnPlayerInDraft &&
          (btnPlayerInDraft.position === "btn" ||
            btnPlayerInDraft.position === "btn_sb")
        ) {
          const btnPlayerId = btnPlayerInDraft.id;
          const btnIndex = activePlayers.findIndex((p) => p.id === btnPlayerId);

          const isOneBig = shouldApplyOneBigForInitialGame(
            draft.input.players,
            btnPlayerInDraft,
            draft.input.setting.blindExceptionRule,
          );

          // bustプレイヤーがBTNの場合の特別処理（dead_button）
          if (btnIndex === -1 && btnPlayerInDraft.status === "bust") {
            if (activePlayers.length >= 2) {
              const btnSeat = btnPlayerInDraft.seat;
              let sbPlayerIndex = -1;

              for (let i = 0; i < activePlayers.length; i++) {
                if (activePlayers[i].seat > btnSeat) {
                  sbPlayerIndex = i;
                  break;
                }
              }
              if (sbPlayerIndex === -1) {
                sbPlayerIndex = 0;
              }

              if (isOneBig) {
                // BTN（デッドボタン）はそのまま、SBをスキップしてBBから割り当て
                const bbPlayer = activePlayers[sbPlayerIndex];
                const bbDraftIndex = draft.input.players.findIndex(
                  (p) => p.id === bbPlayer.id,
                );
                if (bbDraftIndex !== -1) {
                  draft.input.players[bbDraftIndex] = {
                    ...draft.input.players[bbDraftIndex],
                    position: "bb",
                  };
                }

                if (activePlayers.length > 2) {
                  const positions = getPositionsByPlayerCount(
                    activePlayers.length + 2,
                  );
                  const remainingPositions = positions.filter(
                    (pos) => pos !== "btn" && pos !== "sb" && pos !== "bb",
                  );

                  for (let i = 1; i < activePlayers.length; i++) {
                    const playerIndex =
                      (sbPlayerIndex + i) % activePlayers.length;
                    const activePlayer = activePlayers[playerIndex];
                    const position = remainingPositions[i - 1];

                    const playerDraftIndex = draft.input.players.findIndex(
                      (p) => p.id === activePlayer.id,
                    );
                    if (playerDraftIndex !== -1 && position) {
                      draft.input.players[playerDraftIndex] = {
                        ...draft.input.players[playerDraftIndex],
                        position: position,
                      };
                    }
                  }
                }
              } else if (activePlayers.length === 2) {
                const sbPlayer = activePlayers[sbPlayerIndex];
                const bbPlayerIndex = (sbPlayerIndex + 1) % 2;
                const bbPlayer = activePlayers[bbPlayerIndex];

                const sbDraftIndex = draft.input.players.findIndex(
                  (p) => p.id === sbPlayer.id,
                );
                if (sbDraftIndex !== -1) {
                  draft.input.players[sbDraftIndex] = {
                    ...draft.input.players[sbDraftIndex],
                    position: "sb",
                  };
                }

                const bbDraftIndex = draft.input.players.findIndex(
                  (p) => p.id === bbPlayer.id,
                );
                if (bbDraftIndex !== -1) {
                  draft.input.players[bbDraftIndex] = {
                    ...draft.input.players[bbDraftIndex],
                    position: "bb",
                  };
                }
              } else {
                const positions = getPositionsByPlayerCount(
                  activePlayers.length + 1,
                );

                for (let i = 0; i < activePlayers.length; i++) {
                  const playerIndex =
                    (sbPlayerIndex + i) % activePlayers.length;
                  const activePlayer = activePlayers[playerIndex];
                  const position = positions[i + 1];

                  const playerDraftIndex = draft.input.players.findIndex(
                    (p) => p.id === activePlayer.id,
                  );
                  if (playerDraftIndex !== -1 && position) {
                    draft.input.players[playerDraftIndex] = {
                      ...draft.input.players[playerDraftIndex],
                      position: position,
                    };
                  }
                }
              }
            }
          } else if (btnIndex !== -1) {
            // アクティブプレイヤーリスト内にBTNが見つかった（通常の処理）

            if (activePlayers.length === 2 && !isOneBig) {
              // 通常のヘッズアップ
              const btnDraftIndex = draft.input.players.findIndex(
                (p) => p.id === btnPlayerId,
              );
              if (btnDraftIndex !== -1) {
                draft.input.players[btnDraftIndex] = {
                  ...draft.input.players[btnDraftIndex],
                  position: "btn_sb",
                };
              }

              const bbIndex = (btnIndex + 1) % 2;
              const bbPlayerId = activePlayers[bbIndex].id;
              const bbPlayerDraftIndex = draft.input.players.findIndex(
                (p) => p.id === bbPlayerId,
              );
              if (bbPlayerDraftIndex !== -1) {
                draft.input.players[bbPlayerDraftIndex] = {
                  ...draft.input.players[bbPlayerDraftIndex],
                  position: "bb",
                };
              }
            } else if (isOneBig) {
              // One Bigルール適用（SBをスキップ）
              const btnDraftIndex = draft.input.players.findIndex(
                (p) => p.id === btnPlayerId,
              );
              if (btnDraftIndex !== -1) {
                draft.input.players[btnDraftIndex] = {
                  ...draft.input.players[btnDraftIndex],
                  position: "btn",
                };
              }

              const bbIndex = (btnIndex + 1) % activePlayers.length;
              const bbPlayerId = activePlayers[bbIndex].id;
              const bbPlayerDraftIndex = draft.input.players.findIndex(
                (p) => p.id === bbPlayerId,
              );
              if (bbPlayerDraftIndex !== -1) {
                draft.input.players[bbPlayerDraftIndex] = {
                  ...draft.input.players[bbPlayerDraftIndex],
                  position: "bb",
                };
              }

              const positionsExcludingBlinds =
                getPositionsExcludingBlindPositions(activePlayers.length);

              const SKIP_COUNT = 2;

              for (let i = SKIP_COUNT; i < activePlayers.length; i++) {
                const playerIndex = (btnIndex + i) % activePlayers.length;
                const playerId = activePlayers[playerIndex].id;
                const position = positionsExcludingBlinds[i - SKIP_COUNT];

                const playerDraftIndex = draft.input.players.findIndex(
                  (p) => p.id === playerId,
                );
                if (playerDraftIndex !== -1 && position) {
                  draft.input.players[playerDraftIndex] = {
                    ...draft.input.players[playerDraftIndex],
                    position: position,
                  };
                }
              }
            } else if (activePlayers.length > 2) {
              // 3人以上
              const positions = getPositionsByPlayerCount(activePlayers.length);

              for (let i = 0; i < activePlayers.length; i++) {
                const playerIndex = (btnIndex + i) % activePlayers.length;
                const playerId = activePlayers[playerIndex].id;
                const position = positions[i];

                const playerDraftIndex = draft.input.players.findIndex(
                  (p) => p.id === playerId,
                );
                if (playerDraftIndex !== -1 && position) {
                  draft.input.players[playerDraftIndex] = {
                    ...draft.input.players[playerDraftIndex],
                    position: position,
                  };
                }
              }
            }
            // activePlayers.length < 2 の場合は何もしない
          }
        }
      }
      // --- SB/BB 自動設定ここまで ---
    });

    // ローカルも即座に更新（レスポンシブに）
    setInitializeBoardCommand(updatedCommand);

    // サーバーへの通知 (fire-and-forget)
    (async () => {
      try {
        const editPlayerCommand = {
          kind: "editPlayer",
          input: {
            board: {
              players: updatedCommand.input.players,
              setting: {
                mode: updatedCommand.input.setting.mode,
                name: updatedCommand.input.setting.name,
                miniChip: updatedCommand.input.setting.miniChip,
                smallBlind: updatedCommand.input.setting.smallBlind,
                bigBlind: updatedCommand.input.setting.bigBlind,
                anteRule: updatedCommand.input.setting.anteRule,
                blindExceptionRule:
                  updatedCommand.input.setting.blindExceptionRule,
              },
            },
            playerId: player.id,
            player: {
              name: player.name,
              icon: player.icon ?? null,
              status: player.status,
              stack: player.stack,
              position: player.position,
              seat: player.seat,
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
          throw new Error("Failed to edit player");
        }

        // ゲーム設定にもプレイヤー情報を保存
        try {
          const gameSettingsResponse = await apiFetch("/api/game-settings");
          if (!gameSettingsResponse.ok) {
            throw new Error(
              `HTTP error! status: ${gameSettingsResponse.status}`,
            );
          }
          const gameSettingsResult = await gameSettingsResponse.json();

          if (
            gameSettingsResult.type !== "success" ||
            !gameSettingsResult.value
          ) {
            throw new Error("Failed to fetch game settings");
          }

          const existingSettings =
            gameSettingsResult.value as PersistedGameSettings;

          const updatedGameSettings: PersistedGameSettings = {
            ...existingSettings,
            manualMode: {
              players: updatedCommand.input.players.map((p) => ({
                id: p.id,
                name: p.name,
                icon: p.icon ?? null,
                status: p.status as "active" | "inactive" | "out",
                stack: p.stack,
                seat: p.seat,
                position: p.position,
              })),
              settings: updatedCommand.input.setting,
              btnPlayerId: existingSettings.manualMode.btnPlayerId,
            },
            autoMode: {
              players: updatedCommand.input.players
                .filter((p) => p.status === "active")
                .map((manualPlayer) => ({
                  id: manualPlayer.id,
                  name: manualPlayer.name,
                  icon: manualPlayer.icon ?? null,
                  seat: manualPlayer.seat,
                  position: manualPlayer.position,
                })),
              settings: existingSettings.autoMode.settings,
              btnPlayerId: existingSettings.autoMode.btnPlayerId,
            },
          };

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
            "Failed to save game settings after player update",
            {
              cause: gameSettingsError,
              stack:
                gameSettingsError instanceof Error
                  ? gameSettingsError.stack
                  : undefined,
              name:
                gameSettingsError instanceof Error
                  ? gameSettingsError.name
                  : undefined,
            },
          );
        }

        // Tauri コマンドへの通知 (stub: 未実装コマンドはログのみ)
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("set_initial_board_command", {
            command: updatedCommand,
          });
        } catch {
          // コマンド未実装のため無視
        }
      } catch (error) {
        trackClientSideError("Failed to update player information", {
          cause: error,
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
        });
      }
    })();
  };

  /**
   * プレーヤーを削除する。
   *
   * 削除時は全プレイヤーのポジションをリセットし、
   * HTTP API と Tauri コマンドを一括更新する。
   */
  const deletePlayer = (playerId: string) => {
    const positionResetPlayers = initializeBoardCommand.input.players.map(
      (p) => ({
        ...p,
        position: null as null,
      }),
    );

    const editPlayerCommand: ManualModeInitializeBoardCommand = {
      kind: "initializeBoard",
      input: {
        players: positionResetPlayers,
        setting: {
          mode: initializeBoardCommand.input.setting.mode,
          name: initializeBoardCommand.input.setting.name,
          miniChip: initializeBoardCommand.input.setting.miniChip,
          smallBlind: initializeBoardCommand.input.setting.smallBlind,
          bigBlind: initializeBoardCommand.input.setting.bigBlind,
          anteRule: initializeBoardCommand.input.setting.anteRule,
          blindExceptionRule:
            initializeBoardCommand.input.setting.blindExceptionRule,
        },
      },
    };

    const updatedCommand = produce(initializeBoardCommand, (draft) => {
      for (let i = 0; i < draft.input.players.length; i++) {
        draft.input.players[i] = {
          ...draft.input.players[i],
          position: null,
        };
      }
      draft.input.players = draft.input.players.filter(
        (player) => player.id !== playerId,
      );
    });

    // Tauri コマンドへの通知 (stub)
    import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke("set_initial_board_command", { command: updatedCommand }),
      )
      .catch(() => {});

    // ローカルも即座に更新（レスポンシブに）
    setInitializeBoardCommand(updatedCommand);

    (async () => {
      try {
        const response = await apiFetch("/api/initial-board/player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "editPlayer",
            input: {
              board: {
                players: editPlayerCommand.input.players,
                setting: {
                  mode: editPlayerCommand.input.setting.mode,
                  name: editPlayerCommand.input.setting.name,
                  miniChip: editPlayerCommand.input.setting.miniChip,
                  smallBlind: editPlayerCommand.input.setting.smallBlind,
                  bigBlind: editPlayerCommand.input.setting.bigBlind,
                  anteRule: editPlayerCommand.input.setting.anteRule,
                  blindExceptionRule:
                    editPlayerCommand.input.setting.blindExceptionRule,
                },
              },
              playerId: playerId,
              player: null,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.type !== "success") {
          throw new Error("Failed to delete player from board");
        }

        const settingsResponse = await apiFetch("/api/game-settings");
        if (!settingsResponse.ok) {
          throw new Error(`HTTP error! status: ${settingsResponse.status}`);
        }
        const settingsResult = await settingsResponse.json();

        if (settingsResult.type !== "success" || !settingsResult.value) {
          throw new Error("Failed to fetch game settings");
        }

        const existingSettings = settingsResult.value as PersistedGameSettings;

        const updatedSettings: PersistedGameSettings = {
          ...existingSettings,
          manualMode: {
            ...existingSettings.manualMode,
            players: updatedCommand.input.players.map((p) => ({
              id: p.id,
              name: p.name,
              icon: p.icon ?? null,
              status: p.status as "active" | "inactive" | "out",
              stack: p.stack,
              seat: p.seat,
              position: p.position,
            })),
          },
          autoMode: {
            players: updatedCommand.input.players
              .filter((p) => p.status === "active")
              .map((manualPlayer) => ({
                id: manualPlayer.id,
                name: manualPlayer.name,
                icon: manualPlayer.icon ?? null,
                seat: manualPlayer.seat,
                position: manualPlayer.position,
              })),
            settings: existingSettings.autoMode.settings,
            btnPlayerId: existingSettings.autoMode.btnPlayerId,
          },
        };

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
        trackClientSideError("Failed to delete player", {
          cause: error,
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
        });
      }
    })();
  };

  /**
   * 開発用のゲーム設定を更新する
   * 本番では使用禁止
   *
   * @deprecated
   */
  const updateInitializeBoardSettingForDevelopment = () => {
    const positions = getPositionsByPlayerCount(9);

    const updatedCommand = {
      kind: "initializeBoard" as const,
      input: {
        players: RESERVED_GUEST_PLAYER_IDS.slice(0, 9).map((guestId, i) => ({
          id: guestId,
          name: (i + 1).toString(),
          status: "active" as const,
          stack: 100000,
          position: positions[i],
          seat: (i + 1) as PlayerSeatRange,
        })),
        setting: {
          name: "TEST TOURNAMENT",
          mode: "manual" as const,
          miniChip: 100,
          smallBlind: 500,
          bigBlind: 1000,
          anteRule: "none" as const,
          blindExceptionRule: "dead_button" as const,
        },
      },
    };

    // Tauri コマンドへの通知 (stub)
    import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke("set_initial_board_command", { command: updatedCommand }),
      )
      .catch(() => {});

    setInitializeBoardCommand(updatedCommand);
  };

  return (
    <InitializeBoardCommandContext.Provider
      value={{
        initializeBoardCommand,
        isStartable,
        updateInitializeBoardSetting,
        updatePlayer,
        deletePlayer,
        updateInitializeBoardSettingForDevelopment,
      }}
    >
      {children}
    </InitializeBoardCommandContext.Provider>
  );
};

export const useInitializeBoardCommand = () => {
  const context = useContext(InitializeBoardCommandContext);
  return context;
};
