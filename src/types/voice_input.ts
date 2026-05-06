export type VoicePositionKey = "btn" | "sb" | "bb";

export const VOICE_POSITION_KEYS: readonly VoicePositionKey[] = [
  "btn",
  "sb",
  "bb",
] as const;

const VOICE_POSITION_KEY_SET: ReadonlySet<string> = new Set(
  VOICE_POSITION_KEYS,
);

export const isVoicePositionKey = (value: unknown): value is VoicePositionKey =>
  typeof value === "string" && VOICE_POSITION_KEY_SET.has(value);

export type VoicePokerAction =
  | "bet"
  | "raise"
  | "call"
  | "fold"
  | "check"
  | "all-in"
  | "expose"
  | "back"
  | "ok"
  | "check-around";

export const VALID_VOICE_ACTIONS: readonly VoicePokerAction[] = [
  "bet",
  "raise",
  "call",
  "fold",
  "check",
  "all-in",
  "expose",
  "back",
  "ok",
  "check-around",
] as const;

/**
 * 音声入力でディーラーが指定したアクション対象プレイヤー。
 * - `seat`: 「N 番」形式
 * - `position`: BTN/SB/BB ポジション発話
 * - `current`: 指定なし（現在アクション待ちプレイヤー）
 */
export type VoiceCommandTarget =
  | { _kind: "seat"; seatNumber: number }
  | { _kind: "position"; position: VoicePositionKey }
  | { _kind: "current" };

export interface VoicePokerCommand {
  /**
   * 音声から解析されたアクション種別。
   * `null` の場合は「数字のみ発声」でクライアント側で解決される。
   */
  action: VoicePokerAction | null;
  amount: number | null;
  confidence: number;
  target?: VoiceCommandTarget;
  /** @deprecated 新規コードでは target を参照すること。後方互換のため残す。 */
  seatNumber?: number;
  rawText: string;
  timestamp: number;
  processingTime?: number;
  sttTime?: number;
  llmTime?: number;
  modelId?: string;
  streetAtCapture?: string;
}

export type VoiceInputStatus =
  | "stopped"
  | "listening"
  | "speaking"
  | "processing"
  | "error";

export interface VoiceInputStatusEvent {
  status: VoiceInputStatus;
  message?: string;
}

export interface VoiceInputSettings {
  enabled: boolean;
  deviceId?: string;
  sttModel: string;
  confidenceThreshold: number;
  endpointingMs: number;
}

/**
 * 音声入力の診断メトリクス。
 * VoiceInputService が 1 秒ごとに収集し、onDiagnostics コールバックで通知する。
 * 設定画面の診断パネルで表示する。
 */
export interface VoiceInputDiagnostics {
  /** 接続開始からの経過ミリ秒 (stopped / error のときは null) */
  connectionUptimeMs: number | null;
  /** Deepgram WebSocket へ送信したフレーム数（累積） */
  framesSent: number;
  /** 最後にフレームを送信した時刻 (Unix ms)。未送信時は null */
  lastFrameSentAt: number | null;
  /** WebSocket 切断理由（最後の異常切断のコード＋理由。正常停止は null） */
  lastDisconnectReason: string | null;
  /** 累積エラー数（接続エラー・送信エラーを含む） */
  errorCount: number;
  /** 現在の再接続試行回数 */
  reconnectAttempts: number;
  /** Deepgram WebSocket の現在の readyState (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED, null=未生成) */
  wsReadyState: number | null;
}

export type DiagnosticsCallback = (diagnostics: VoiceInputDiagnostics) => void;
