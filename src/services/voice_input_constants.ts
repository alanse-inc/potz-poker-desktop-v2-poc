import type { VoiceInputStatus } from "../types/voice_input";

export const STATUS_COLORS: Record<VoiceInputStatus, string> = {
  stopped: "bg-gray-500",
  listening: "bg-green-500",
  speaking: "bg-blue-500",
  processing: "bg-yellow-500",
  error: "bg-red-500",
};

export const STATUS_LABELS: Record<VoiceInputStatus, string> = {
  stopped: "停止中",
  listening: "認識待機中",
  speaking: "発話検出中",
  processing: "解析中",
  error: "エラー",
};

export const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";
export const MAX_RECONNECT_ATTEMPTS = 5;
export const RECONNECT_DELAY_MS = 1000;
export const KEEP_ALIVE_INTERVAL_MS = 8000;
export const AUDIO_BUFFER_LIMIT = 10;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.3;
export const DEFAULT_ENDPOINTING_MS = 200;

// Audio Processing
export const MIC_GAIN = 1.0;
export const COMPRESSOR_THRESHOLD_DB = 0;
export const COMPRESSOR_KNEE_DB = 0;
export const COMPRESSOR_RATIO = 1;
export const COMPRESSOR_ATTACK_S = 0.003;
export const COMPRESSOR_RELEASE_S = 0.1;
export const AUDIO_PROCESSOR_BUFFER_SIZE = 4096;

// Deepgram パラメータ
export const DEEPGRAM_UTTERANCE_END_MS = 1000;

export const FILLER_WORDS = [
  "えっと",
  "えーと",
  "ええと",
  "えと",
  "あの",
  "あのー",
  "まあ",
  "まー",
  "えー",
  "ええ",
  "うーん",
  "うん",
  "ん",
  "んー",
  "あー",
  "ああ",
  "その",
  "そのー",
  "なんか",
  "なんて",
];

export const DEEPGRAM_KEYTERMS: readonly string[] = [
  "ベット",
  "レイズ",
  "コール",
  "フォールド",
  "チェック",
  "オールイン",
  "エクスポーズ",
  "バック",
  "bet",
  "raise",
  "call",
  "fold",
  "check",
  "all-in",
  "expose",
  "back",
  "ok",
];
