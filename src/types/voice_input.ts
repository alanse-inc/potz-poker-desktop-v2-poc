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
