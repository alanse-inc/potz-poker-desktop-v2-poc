/**
 * VoiceInputService — Tauri 版スケルトン
 *
 * Deepgram WebSocket へのストリーミング STT と、
 * それをポーカーコマンドに変換する LLM 呼び出しのスケルトン。
 *
 * API キーが未設定の場合は start() が即座に "error" ステータスを発行し、
 * UI 側で「APIキー未設定」メッセージを表示する。
 *
 * フロー: getUserMedia → AudioContext(16kHz) → ScriptProcessor →
 *         Int16 PCM → WebSocket(Deepgram) → is_final transcript →
 *         (将来 LLM 呼び出し) → VoicePokerCommand emit
 */

import type {
  VoiceInputSettings,
  VoiceInputStatus,
  VoiceInputStatusEvent,
  VoicePokerCommand,
} from "../types/voice_input";
import {
  AUDIO_BUFFER_LIMIT,
  AUDIO_PROCESSOR_BUFFER_SIZE,
  COMPRESSOR_ATTACK_S,
  COMPRESSOR_KNEE_DB,
  COMPRESSOR_RATIO,
  COMPRESSOR_RELEASE_S,
  COMPRESSOR_THRESHOLD_DB,
  DEEPGRAM_KEYTERMS,
  DEEPGRAM_UTTERANCE_END_MS,
  DEEPGRAM_WS_URL,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_ENDPOINTING_MS,
  FILLER_WORDS,
  KEEP_ALIVE_INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_DELAY_MS,
  MIC_GAIN,
  RECONNECT_DELAY_MS,
} from "./voice_input_constants";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface AudioDevice {
  deviceId: string;
  label: string;
}

interface DeepgramMessage {
  type?: string;
  channel?: {
    alternatives?: {
      transcript?: string;
    }[];
  };
  is_final?: boolean;
}

type CommandCallback = (command: VoicePokerCommand) => void;
type StatusCallback = (event: VoiceInputStatusEvent) => void;

// ---------------------------------------------------------------------------
// エラートラッカー (console.error フォールバック)
// ---------------------------------------------------------------------------

function trackError(message: string): void {
  console.error(`[VoiceInputService] ${message}`);
}

// ---------------------------------------------------------------------------
// テキストユーティリティ
// ---------------------------------------------------------------------------

function cleanText(text: string): string {
  return text
    .replace(/[。！？!?.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isFillerWordOnly(text: string): boolean {
  return FILLER_WORDS.includes(text.trim());
}

// ---------------------------------------------------------------------------
// 設定ストレージ (Tauri Plugin Store 互換: @tauri-apps/plugin-store)
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "voice_input_settings";

async function loadPersistedSettings(): Promise<VoiceInputSettings | null> {
  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    const store = await Store.load("settings.json");
    const raw = await store.get<VoiceInputSettings>(SETTINGS_KEY);
    return raw ?? null;
  } catch {
    return null;
  }
}

async function savePersistedSettings(
  settings: VoiceInputSettings,
): Promise<void> {
  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    const store = await Store.load("settings.json");
    await store.set(SETTINGS_KEY, settings);
    await store.save();
  } catch {
    // 保存失敗はアプリ動作に影響させない
  }
}

// ---------------------------------------------------------------------------
// VoiceInputService クラス
// ---------------------------------------------------------------------------

export class VoiceInputService {
  private _status: VoiceInputStatus = "stopped";
  private _enabled = false;
  private _deviceId: string | undefined = undefined;
  private _sttModel = "nova-3";
  private _confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD;
  private _endpointingMs = DEFAULT_ENDPOINTING_MS;

  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private commandCallbacks: Set<CommandCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private reconnectAttempts = 0;
  private intentionallyStopped = false;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAudio: ArrayBuffer[] = [];
  private startPromise: Promise<void> | null = null;
  private speechStartTime: number | null = null;
  private lastInterimTranscript: string | null = null;

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get status(): VoiceInputStatus {
    return this._status;
  }

  get isRunning(): boolean {
    return this._status !== "stopped" && this._status !== "error";
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get deviceId(): string | undefined {
    return this._deviceId;
  }

  get sttModel(): string {
    return this._sttModel;
  }

  get confidenceThreshold(): number {
    return this._confidenceThreshold;
  }

  get endpointingMs(): number {
    return this._endpointingMs;
  }

  // ---------------------------------------------------------------------------
  // デバイス一覧取得
  // ---------------------------------------------------------------------------

  async getAudioDevices(): Promise<AudioDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `マイク (${d.deviceId.slice(0, 8)})`,
      }));
  }

  // ---------------------------------------------------------------------------
  // コールバック登録
  // ---------------------------------------------------------------------------

  onCommand(callback: CommandCallback): () => void {
    this.commandCallbacks.add(callback);
    return () => {
      this.commandCallbacks.delete(callback);
    };
  }

  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  // ---------------------------------------------------------------------------
  // 設定の適用・永続化
  // ---------------------------------------------------------------------------

  async applySettings(params: {
    deviceId: string;
    sttModel: string;
    enabled: boolean;
    confidenceThreshold: number;
    endpointingMs: number;
  }): Promise<void> {
    this._deviceId = params.deviceId || undefined;
    this._sttModel = params.sttModel;
    this._confidenceThreshold = params.confidenceThreshold;
    this._endpointingMs = params.endpointingMs;
    this._enabled = params.enabled;

    if (params.enabled && !this.isRunning) {
      await this.start();
    } else if (!params.enabled && this.isRunning) {
      this.stop();
    }

    await savePersistedSettings({
      enabled: this._enabled,
      deviceId: this._deviceId,
      sttModel: this._sttModel,
      confidenceThreshold: this._confidenceThreshold,
      endpointingMs: this._endpointingMs,
    });
  }

  async loadSettings(): Promise<void> {
    const settings = await loadPersistedSettings();
    if (settings) {
      this._deviceId = settings.deviceId;
      this._sttModel = settings.sttModel ?? "nova-3";
      this._confidenceThreshold =
        settings.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
      this._endpointingMs = settings.endpointingMs ?? DEFAULT_ENDPOINTING_MS;
      this._enabled = settings.enabled ?? false;
    }
  }

  // ---------------------------------------------------------------------------
  // 起動 / 停止
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning) return;

    if (this.startPromise) {
      try {
        await this.startPromise;
      } catch {
        // 先行 start() のエラーは既に処理済み
      }
      if (this.isRunning) return;
    }

    this.intentionallyStopped = false;
    this.reconnectAttempts = 0;

    this.startPromise = (async () => {
      try {
        this.emitStatus("listening");
        await this.setupAudioCapture();
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message || error.name || "音声入力の起動に失敗しました"
            : "音声入力の起動に失敗しました";
        this.emitStatus("error", msg);
        throw error;
      }
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  stop(): void {
    this.intentionallyStopped = true;
    this.cleanup();
    this.emitStatus("stopped");
  }

  // ---------------------------------------------------------------------------
  // 音声キャプチャのセットアップ
  // ---------------------------------------------------------------------------

  private async setupAudioCapture(): Promise<void> {
    const deepgramApiKey = import.meta.env.VITE_DEEPGRAM_API_KEY as
      | string
      | undefined;

    if (!deepgramApiKey) {
      throw new Error(
        "VITE_DEEPGRAM_API_KEY が設定されていません。.env ファイルに追加してください。",
      );
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: this._deviceId ? { deviceId: { ideal: this._deviceId } } : true,
    });

    // getUserMedia 待機中に stop() が呼ばれた場合はストリームを解放して終了
    if (this.intentionallyStopped) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    }

    this.mediaStream = stream;
    this.connectWebSocket(deepgramApiKey, stream);
  }

  // ---------------------------------------------------------------------------
  // WebSocket 接続
  // ---------------------------------------------------------------------------

  private connectWebSocket(apiKey: string, stream: MediaStream): void {
    if (this.intentionallyStopped) return;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.cleanupAudioProcessor();

    const wsUrl = new URL(DEEPGRAM_WS_URL);
    wsUrl.searchParams.set("language", "ja");
    wsUrl.searchParams.set("model", this._sttModel);
    wsUrl.searchParams.set("sample_rate", "16000");
    wsUrl.searchParams.set("encoding", "linear16");
    wsUrl.searchParams.set("channels", "1");
    wsUrl.searchParams.set("smart_format", "true");
    wsUrl.searchParams.set("interim_results", "true");
    wsUrl.searchParams.set("endpointing", String(this._endpointingMs));
    wsUrl.searchParams.set(
      "utterance_end_ms",
      String(DEEPGRAM_UTTERANCE_END_MS),
    );
    wsUrl.searchParams.set("vad_events", "true");
    for (const keyword of DEEPGRAM_KEYTERMS) {
      wsUrl.searchParams.append("keyterm", keyword);
    }

    const ws = new WebSocket(wsUrl.toString(), ["token", apiKey]);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emitStatus("listening");
      this.setupAudioProcessor(stream);
      this.startKeepAlive();
      this.flushPendingAudio();
    };

    ws.onmessage = (event: MessageEvent) => {
      this.handleDeepgramMessage(event.data as string);
    };

    ws.onerror = (event: Event) => {
      trackError(`DeepGram WebSocket 接続エラー: ${event.type}`);
      this.emitStatus("error", "DeepGram WebSocket 接続エラー");
    };

    ws.onclose = (event: CloseEvent) => {
      this.stopKeepAlive();

      if (this.intentionallyStopped) {
        if (this._status !== "stopped" && this._status !== "error") {
          this.emitStatus("stopped");
        }
        return;
      }

      const isAbnormalClose = event.code !== 1000;
      if (isAbnormalClose && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
          MAX_RECONNECT_DELAY_MS,
        );
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (!this.intentionallyStopped) {
            this.connectWebSocket(apiKey, stream);
          }
        }, delay);
      } else {
        this.cleanup();
        this.emitStatus(
          "error",
          "再接続上限に達しました。音声入力を再起動してください。",
        );
      }
    };
  }

  // ---------------------------------------------------------------------------
  // 音声プロセッサ
  // ---------------------------------------------------------------------------

  private setupAudioProcessor(stream: MediaStream): void {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    this.audioContext = audioContext;
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const source = audioContext.createMediaStreamSource(stream);

    const gainNode = audioContext.createGain();
    gainNode.gain.value = MIC_GAIN;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = COMPRESSOR_THRESHOLD_DB;
    compressor.knee.value = COMPRESSOR_KNEE_DB;
    compressor.ratio.value = COMPRESSOR_RATIO;
    compressor.attack.value = COMPRESSOR_ATTACK_S;
    compressor.release.value = COMPRESSOR_RELEASE_S;

    const processor = audioContext.createScriptProcessor(
      AUDIO_PROCESSOR_BUFFER_SIZE,
      1,
      1,
    );
    this.scriptProcessor = processor;

    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    this.silentGain = silentGain;

    source.connect(gainNode);
    gainNode.connect(compressor);
    compressor.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(
          -32768,
          Math.min(32767, Math.round(float32[i] * 32768)),
        );
      }
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(int16.buffer);
      } else {
        if (this.pendingAudio.length >= AUDIO_BUFFER_LIMIT) {
          this.pendingAudio.shift();
        }
        // int16.buffer を slice でコピーして保存する。WebSocket.send により
        // 元の ArrayBuffer が transferred (detached) になった場合でも
        // pendingAudio の buffer は独立したコピーとして残る。
        this.pendingAudio.push(int16.buffer.slice(0));
      }
    };
  }

  private cleanupAudioProcessor(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = null;
    }
    if (this.silentGain) {
      this.silentGain.disconnect();
      this.silentGain = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch((error: unknown) => {
        trackError(
          `AudioContext close error: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      this.audioContext = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Keep-alive / Flush
  // ---------------------------------------------------------------------------

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, KEEP_ALIVE_INTERVAL_MS);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval !== null) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private flushPendingAudio(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    for (const buffer of this.pendingAudio) {
      this.ws.send(buffer);
    }
    this.pendingAudio = [];
  }

  // ---------------------------------------------------------------------------
  // Deepgram メッセージハンドリング
  // ---------------------------------------------------------------------------

  private handleDeepgramMessage(rawData: string): void {
    try {
      const data = JSON.parse(rawData) as DeepgramMessage;

      if (data.type === "UtteranceEnd") {
        this.speechStartTime = null;
        if (this._status === "speaking") {
          this.emitStatus("listening", "発話終了（沈黙検出）");
        }
        return;
      }

      const transcript = data.channel?.alternatives?.[0]?.transcript ?? "";
      const hasText = transcript.trim().length > 0;

      if (hasText && !data.is_final) {
        if (this.speechStartTime === null) {
          this.speechStartTime = Date.now();
        }
        this.lastInterimTranscript = transcript;
        this.emitStatus("speaking", `認識中: ${transcript}`);
        return;
      }

      if (data.is_final) {
        const finalText = hasText
          ? transcript
          : (this.lastInterimTranscript ?? "");
        this.lastInterimTranscript = null;
        const sttTime =
          this.speechStartTime !== null ? Date.now() - this.speechStartTime : 0;
        this.speechStartTime = null;

        if (finalText.trim().length > 0) {
          this.emitStatus("processing", `認識完了: ${finalText}`);
          this.processTranscript(finalText, sttTime).catch((error: unknown) => {
            trackError(
              `文字起こし処理エラー: ${error instanceof Error ? error.message : String(error)}`,
            );
            this.emitStatus("listening", "処理エラー");
          });
        } else if (this._status === "speaking") {
          this.emitStatus("listening", "認識テキストなし（短い発話/ノイズ）");
        }
      }
    } catch (error) {
      trackError(
        `DeepGram メッセージのパースに失敗: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // トランスクリプト処理 (スケルトン: LLM 呼び出しは未実装)
  // ---------------------------------------------------------------------------

  private async processTranscript(
    text: string,
    _sttTime: number,
  ): Promise<void> {
    const cleaned = cleanText(text);

    if (isFillerWordOnly(cleaned)) {
      this.emitStatus("listening");
      return;
    }

    // TODO: LLM (Cerebras / OpenRouter 等) 呼び出しをここに実装する。
    // それまでは文字起こしのみで command emit は行わない。
    // (action: null / confidence: 0 のダミー emit は購読側 status 連鎖の原因となるため削除)
    this.emitStatus("listening");
  }

  // ---------------------------------------------------------------------------
  // クリーンアップ
  // ---------------------------------------------------------------------------

  private cleanup(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopKeepAlive();
    this.cleanupAudioProcessor();

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;

      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "CloseStream" }));
        } catch {
          // 送信失敗は無視
        }
        setTimeout(() => ws.close(1000), 200);
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    this.pendingAudio = [];
  }

  // ---------------------------------------------------------------------------
  // emit ヘルパー
  // ---------------------------------------------------------------------------

  emitStatusPublic(status: VoiceInputStatus, message?: string): void {
    this.emitStatus(status, message);
  }

  private emitStatus(status: VoiceInputStatus, message?: string): void {
    this._status = status;
    const event: VoiceInputStatusEvent = {
      status,
      ...(message ? { message } : {}),
    };
    for (const cb of this.statusCallbacks) {
      cb(event);
    }
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: LLM 実装時に processTranscript から呼ぶ予定。onCommand 公開 API を維持するため残す。
  private emitCommand(command: VoicePokerCommand): void {
    for (const cb of this.commandCallbacks) {
      cb(command);
    }
  }
}

export const voiceInputService = new VoiceInputService();
