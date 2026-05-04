/**
 * テーブル名同期のビジネスルールを管理するドメインモジュール
 *
 * ビジネスルール:
 * - テーブル名（トーナメント名）はManual ModeとAuto Mode間で共有される
 * - どちらのモードからテーブル名を変更しても、両モードに反映される
 *
 * このモジュールにより、テーブル名同期のビジネスロジックが
 * UIレイヤー（React Context）から分離され、テスタビリティが向上する
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type AnteRule = "none" | "bbante";
export type BlindExceptionRule = "dead_button" | "moving_forward";
export type PlayerStatus = "active" | "inactive" | "out";
export type TelopId = string;

/** 永続化するゲーム設定データの型定義 */
export type PersistedGameSettings = {
  /** 現在のゲームモード */
  currentMode: "manual" | "auto";

  /** Manual Mode 用の設定とプレイヤー情報 */
  manualMode: {
    players: {
      id: string;
      name: string;
      icon: string | null;
      status: PlayerStatus;
      stack: number;
      seat: number;
      position: string | null;
    }[];
    settings: {
      name: string;
      miniChip: number;
      smallBlind: number;
      bigBlind: number;
      anteRule: AnteRule;
      blindExceptionRule: BlindExceptionRule;
    };
    btnPlayerId: string | null;
  };

  /** Auto Mode 用の設定とプレイヤー情報 */
  autoMode: {
    players: {
      id: string;
      name: string;
      icon: string | null;
      seat: number;
      position: string | null;
    }[];
    settings: {
      name: string;
    };
    btnPlayerId: string | null;
  };

  /** テロップ設定（両モード共通） */
  telopSettings: {
    telopId: TelopId;
    backgroundColor: string;
  };
};

// ---------------------------------------------------------------------------
// デフォルト設定生成
// ---------------------------------------------------------------------------

/**
 * デフォルトのゲーム設定を生成する。
 * 新規インストール時やデータリセット時に使用。
 */
export function createDefaultGameSettings(): PersistedGameSettings {
  return {
    currentMode: "manual",
    manualMode: {
      players: [],
      settings: {
        name: "",
        miniChip: 0,
        smallBlind: 0,
        bigBlind: 0,
        anteRule: "none",
        blindExceptionRule: "dead_button",
      },
      btnPlayerId: null,
    },
    autoMode: {
      players: [],
      settings: {
        name: "",
      },
      btnPlayerId: null,
    },
    telopSettings: {
      telopId: "basic",
      backgroundColor: "#00FF00",
    },
  };
}

// ---------------------------------------------------------------------------
// Result 型 (neverthrow を使わず標準パターンで定義)
// ---------------------------------------------------------------------------

type Result<T, E> =
  | {
      readonly ok: true;
      readonly value: T;
      isOk(): true;
      isErr(): false;
      _unsafeUnwrap(): T;
    }
  | { readonly ok: false; readonly error: E; isOk(): false; isErr(): true };

function resultOk<T, E>(value: T): Result<T, E> {
  return {
    ok: true,
    value,
    isOk(): true {
      return true;
    },
    isErr(): false {
      return false;
    },
    _unsafeUnwrap(): T {
      return value;
    },
  } as Result<T, E>;
}

// ---------------------------------------------------------------------------
// エラー型
// ---------------------------------------------------------------------------

/**
 * テーブル名同期のエラー型
 */
export class TableNameSyncError extends Error {
  readonly _tag = "TableNameSyncError";

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "TableNameSyncError";
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// TableNameSync
// ---------------------------------------------------------------------------

export const TableNameSync = {
  /**
   * テーブル名を両モードに同期する
   *
   * @param settings - 現在の永続化されたゲーム設定
   * @param newTableName - 新しいテーブル名
   * @returns 更新されたゲーム設定（両モードにテーブル名が反映）
   */
  syncTableName(
    settings: PersistedGameSettings,
    newTableName: string,
  ): Result<PersistedGameSettings, TableNameSyncError> {
    const updatedSettings: PersistedGameSettings = {
      ...settings,
      manualMode: {
        ...settings.manualMode,
        settings: {
          ...settings.manualMode.settings,
          name: newTableName,
        },
      },
      autoMode: {
        ...settings.autoMode,
        settings: {
          ...settings.autoMode.settings,
          name: newTableName,
        },
      },
    };

    return resultOk(updatedSettings);
  },

  /**
   * Manual Mode 固有の設定を更新する
   * （テーブル名以外の設定はモード間で共有しない）
   *
   * @param settings - 現在の永続化されたゲーム設定
   * @param key - 更新する設定キー
   * @param value - 新しい値
   * @returns 更新されたゲーム設定
   */
  updateManualModeSetting<
    K extends Exclude<
      keyof PersistedGameSettings["manualMode"]["settings"],
      "name"
    >,
  >(
    settings: PersistedGameSettings,
    key: K,
    value: PersistedGameSettings["manualMode"]["settings"][K],
  ): Result<PersistedGameSettings, TableNameSyncError> {
    const updatedSettings: PersistedGameSettings = {
      ...settings,
      manualMode: {
        ...settings.manualMode,
        settings: {
          ...settings.manualMode.settings,
          [key]: value,
        },
      },
    };

    return resultOk(updatedSettings);
  },
} as const;
