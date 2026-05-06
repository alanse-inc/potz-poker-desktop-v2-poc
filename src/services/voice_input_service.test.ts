/**
 * VoiceInputService unit tests
 *
 * focus: reconnect setTimeout キャンセル (BUG-D)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** マイクロタスクキューを空にするヘルパー (fakeTimers 環境でも動作) */
const flushPromises = () =>
  new Promise<void>((resolve) => queueMicrotask(resolve));

// ---------------------------------------------------------------------------
// @tauri-apps/plugin-store モック (loadPersistedSettings / savePersistedSettings)
// ---------------------------------------------------------------------------
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn().mockResolvedValue({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// ---------------------------------------------------------------------------
// import.meta.env モック (VITE_DEEPGRAM_API_KEY)
// ---------------------------------------------------------------------------
vi.stubEnv("VITE_DEEPGRAM_API_KEY", "test-api-key");

import { VoiceInputService } from "./voice_input_service";

// ---------------------------------------------------------------------------
// WebSocket モック
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState: number;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;

  readonly sentData: (string | ArrayBuffer)[] = [];

  constructor(
    public readonly url: string,
    _protocols?: string | string[],
  ) {
    this.readyState = WebSocket.CONNECTING;
    MockWebSocket.instances.push(this);
  }

  send(data: string | ArrayBuffer): void {
    this.sentData.push(data);
  }

  close(code?: number): void {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code: code ?? 1000 });
  }

  /** テストヘルパー: 接続成功をシミュレート */
  simulateOpen(): void {
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }

  /** テストヘルパー: 異常切断をシミュレート (code=1006) */
  simulateAbnormalClose(code = 1006): void {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

// ---------------------------------------------------------------------------
// MediaStream / getUserMedia モック
// ---------------------------------------------------------------------------

function createMockMediaStream(): MediaStream {
  const track = {
    stop: vi.fn(),
    kind: "audio",
    id: "mock-track",
  } as unknown as MediaStreamTrack;

  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

// ---------------------------------------------------------------------------
// AudioContext モック
// ---------------------------------------------------------------------------

function setupAudioContextMock(): void {
  const mockProcessor = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null as ((e: AudioProcessingEvent) => void) | null,
  };
  const mockGain = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1.0 },
  };
  const mockCompressor = {
    connect: vi.fn(),
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 1 },
    attack: { value: 0.003 },
    release: { value: 0.1 },
  };
  const mockSource = { connect: vi.fn() };

  class MockAudioContext {
    state = "running";
    sampleRate = 16000;
    destination = {};
    createMediaStreamSource = vi.fn().mockReturnValue(mockSource);
    createGain = vi.fn().mockReturnValue(mockGain);
    createDynamicsCompressor = vi.fn().mockReturnValue(mockCompressor);
    createScriptProcessor = vi.fn().mockReturnValue(mockProcessor);
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  }

  vi.stubGlobal("AudioContext", MockAudioContext);
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe("VoiceInputService – reconnect timer cancellation (BUG-D)", () => {
  let service: VoiceInputService;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;

    // WebSocket グローバルを差し替え
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, WebSocket));

    // getUserMedia モック
    const mockStream = createMockMediaStream();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    // AudioContext モック
    setupAudioContextMock();

    // 新しいインスタンスを毎回生成（シングルトンではなく独立したインスタンスでテスト）
    service = new VoiceInputService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("stop() 後に reconnect setTimeout を flush しても connectWebSocket が再呼び出しされない", async () => {
    // start() を呼び出す（getUserMedia → connectWebSocket が走る）
    const startPromise = service.start();

    // getUserMedia は Promise なので 1 tick 進める
    await flushPromises();
    await startPromise;

    // WebSocket が 1 つ作られているはず
    expect(MockWebSocket.instances.length).toBe(1);
    const ws = MockWebSocket.instances[0];

    // WebSocket を open 状態にする
    ws.simulateOpen();

    // 異常切断でreconnect timerをセット
    ws.simulateAbnormalClose(1006);

    // この時点で reconnect timer が仕掛けられているはず (まだ発火前)
    expect(MockWebSocket.instances.length).toBe(1);

    // stop() を呼ぶ → reconnectTimer がキャンセルされるはず
    service.stop();

    expect(service.status).toBe("stopped");

    // タイマーを全部進めても新しい WebSocket が作られないことを確認
    vi.runAllTimers();

    expect(MockWebSocket.instances.length).toBe(1);
  });

  it("stop() なしの場合は reconnect timer 発火後に再接続が走る", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    expect(MockWebSocket.instances.length).toBe(1);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // 異常切断
    ws.simulateAbnormalClose(1006);
    expect(MockWebSocket.instances.length).toBe(1);

    // stop() を呼ばずにタイマーを進める → 再接続が走るはず
    vi.runAllTimers();

    expect(MockWebSocket.instances.length).toBe(2);
  });

  it("stop() 直後の status は stopped になる", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    service.stop();
    expect(service.status).toBe("stopped");
  });
});

// ---------------------------------------------------------------------------
// 指数バックオフ / 最大試行後のクリーンアップ (BUG-S-2)
// ---------------------------------------------------------------------------

describe("VoiceInputService – exponential backoff reconnect (BUG-S-2)", () => {
  let service: VoiceInputService;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;

    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, WebSocket));

    const mockStream = createMockMediaStream();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    setupAudioContextMock();

    service = new VoiceInputService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("再接続遅延が指数バックオフで増加する（同一接続内）", async () => {
    // RECONNECT_DELAY_MS=1000 として, attempt=0→1000ms, attempt=1→2000ms, attempt=2→4000ms
    // onopen で reconnectAttempts=0 にリセットされるため、
    // 指数バックオフは「open せずに連続切断」したときに有効になる
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    // WS #0: open → 異常切断 → 再接続待ち (delay=1000ms, attempt=0 時)
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();
    ws0.simulateAbnormalClose(1006);

    // 1000ms ちょうどでは発火しない (delay は Math.pow(2,0)*1000 = 1000ms)
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances.length).toBe(1);

    // 1000ms 経過 → WS #1 が作られる
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances.length).toBe(2);

    // WS #1: open せずに異常切断 → reconnectAttempts=1 のまま → delay=2000ms
    const ws1 = MockWebSocket.instances[1];
    ws1.simulateAbnormalClose(1006);

    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances.length).toBe(2);

    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances.length).toBe(3);

    // WS #2: open せずに異常切断 → reconnectAttempts=2 のまま → delay=4000ms
    const ws2 = MockWebSocket.instances[2];
    ws2.simulateAbnormalClose(1006);

    vi.advanceTimersByTime(3999);
    expect(MockWebSocket.instances.length).toBe(3);

    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances.length).toBe(4);
  });

  it("MAX_RECONNECT_ATTEMPTS 達成後に status=error かつ cleanup が呼ばれる", async () => {
    const statusEvents: string[] = [];
    service.onStatus((e) => statusEvents.push(e.status));

    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    // WS #0: open → 異常切断 (attempt=0→1)
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();
    ws0.simulateAbnormalClose(1006);

    // 以後 open せずに連続切断して reconnectAttempts を消費する
    // attempt=1→2→3→4→5 と増やして MAX に達する
    for (let i = 1; i <= 5; i++) {
      vi.runAllTimers();
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateAbnormalClose(1006);
    }

    // MAX=5 を超えた後は再接続なし
    expect(service.status).toBe("error");
    const lastStatus = statusEvents[statusEvents.length - 1];
    expect(lastStatus).toBe("error");
  });

  it("MAX_RECONNECT_ATTEMPTS 後に発行されるエラーイベントにメッセージが含まれる", async () => {
    const errorMessages: (string | undefined)[] = [];
    service.onStatus((e) => {
      if (e.status === "error") {
        errorMessages.push(e.message);
      }
    });

    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    // WS #0: open → 異常切断 (attempt=0→1)
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();
    ws0.simulateAbnormalClose(1006);

    // open せずに連続切断して reconnectAttempts を MAX まで消費する
    for (let i = 1; i <= 5; i++) {
      vi.runAllTimers();
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateAbnormalClose(1006);
    }

    // 最後のエラーイベントには再接続上限メッセージが含まれること
    expect(errorMessages.length).toBeGreaterThan(0);
    const lastMsg = errorMessages[errorMessages.length - 1];
    expect(lastMsg).toContain("再接続上限");
  });
});

// ---------------------------------------------------------------------------
// reconnectAttempts のリセット (Bug 7)
// ---------------------------------------------------------------------------

describe("VoiceInputService – reconnectAttempts reset on open (Bug 7)", () => {
  let service: VoiceInputService;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;

    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, WebSocket));

    const mockStream = createMockMediaStream();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    setupAudioContextMock();

    service = new VoiceInputService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("接続成功後に reconnectAttempts が 0 にリセットされ、再切断時も最初から指数バックオフが始まる", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    // WS #0: open → 異常切断 → 1000ms で再接続
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();
    ws0.simulateAbnormalClose(1006);
    vi.advanceTimersByTime(1000);

    // WS #1: open → reconnectAttempts が 0 にリセットされているはず
    expect(MockWebSocket.instances.length).toBe(2);
    const ws1 = MockWebSocket.instances[1];
    ws1.simulateOpen();

    // 再度異常切断 → attempts が 0 に戻っているので delay は 1000ms になるはず
    ws1.simulateAbnormalClose(1006);

    // 999ms では再接続しない
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances.length).toBe(2);

    // 1000ms で再接続する (0 リセットされているので delay = 1000ms)
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// pendingAudio に slice コピーが保存される (Bug 5)
// ---------------------------------------------------------------------------

describe("VoiceInputService – pendingAudio buffer copy (Bug 5)", () => {
  let service: VoiceInputService;
  let capturedProcessor: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onaudioprocess: ((e: AudioProcessingEvent) => void) | null;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;

    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, WebSocket));

    const mockStream = createMockMediaStream();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    // AudioContext モック (processor の参照をキャプチャ)
    capturedProcessor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null,
    };
    const mockGain = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1.0 },
    };
    const mockCompressor = {
      connect: vi.fn(),
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 1 },
      attack: { value: 0.003 },
      release: { value: 0.1 },
    };
    const mockSource = { connect: vi.fn() };

    class MockAudioContextWithCapture {
      state = "running";
      sampleRate = 16000;
      destination = {};
      createMediaStreamSource = vi.fn().mockReturnValue(mockSource);
      createGain = vi.fn().mockReturnValue(mockGain);
      createDynamicsCompressor = vi.fn().mockReturnValue(mockCompressor);
      createScriptProcessor = vi.fn().mockReturnValue(capturedProcessor);
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
    }

    vi.stubGlobal("AudioContext", MockAudioContextWithCapture);

    service = new VoiceInputService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("WebSocket が OPEN でない時に onaudioprocess は pendingAudio に有効な ArrayBuffer を積む (Bug 5)", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    // setupAudioProcessor は ws.onopen 内で呼ばれるため、まず simulateOpen で
    // onaudioprocess ハンドラを設定させる
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    await flushPromises();
    expect(capturedProcessor.onaudioprocess).not.toBeNull();

    // ws の readyState を CLOSING に変えて pendingAudio 経路を強制
    ws.readyState = WebSocket.CLOSING;

    // Float32Array (PCM データ) をシミュレート
    const float32Data = new Float32Array([0.5, -0.3, 0.1]);
    const mockEvent = {
      inputBuffer: {
        getChannelData: vi.fn().mockReturnValue(float32Data),
      },
    } as unknown as AudioProcessingEvent;

    capturedProcessor.onaudioprocess?.(mockEvent);

    // pendingAudio に積まれた buffer を直接確認
    const pending = (service as unknown as { pendingAudio: ArrayBuffer[] })
      .pendingAudio;
    expect(pending.length).toBe(1);
    const slicedBuffer = pending[0];
    expect(slicedBuffer).toBeInstanceOf(ArrayBuffer);
    expect(slicedBuffer.byteLength).toBeGreaterThan(0);
  });

  it("pendingAudio に push された buffer が元の Int16Array.buffer と独立したコピーである (slice 検証, Bug 5)", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    await flushPromises();
    expect(capturedProcessor.onaudioprocess).not.toBeNull();

    // ws の readyState を CLOSING に変えて pendingAudio 経路を強制
    ws.readyState = WebSocket.CLOSING;

    const float32Data = new Float32Array([0.5]);
    const mockEvent = {
      inputBuffer: {
        getChannelData: vi.fn().mockReturnValue(float32Data),
      },
    } as unknown as AudioProcessingEvent;

    capturedProcessor.onaudioprocess?.(mockEvent);

    const pending = (service as unknown as { pendingAudio: ArrayBuffer[] })
      .pendingAudio;
    expect(pending.length).toBe(1);
    const slicedBuffer = pending[0];

    // slice(0) でコピーされているため、buffer 長が int16 (2 bytes) と一致し、
    // かつ byteLength > 0 (detached でない) であること
    expect(slicedBuffer.byteLength).toBe(Int16Array.BYTES_PER_ELEMENT);
    expect(slicedBuffer.byteLength).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// connectionGeneration による二重接続防止 (Bug 5 / R33)
// ---------------------------------------------------------------------------

describe("VoiceInputService – connectionGeneration prevents double reconnect on applySettings (R33 Bug 5)", () => {
  let service: VoiceInputService;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;

    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, WebSocket));

    const mockStream = createMockMediaStream();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    setupAudioContextMock();

    service = new VoiceInputService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("stop()→start() 後に旧世代の reconnect タイマーが発火しても connectWebSocket が呼ばれない", async () => {
    // start() してから WS を open → 異常切断で reconnect タイマー登録
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    expect(MockWebSocket.instances.length).toBe(1);
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();

    // 異常切断 → reconnect タイマーが登録される（まだ発火していない）
    ws0.simulateAbnormalClose(1006);
    expect(MockWebSocket.instances.length).toBe(1);

    // stop() → connectionGeneration が変わる
    service.stop();
    expect(service.status).toBe("stopped");

    // start() → connectionGeneration がさらに変わる
    const restartPromise = service.start();
    await flushPromises();
    await restartPromise;

    // 新しい WS が作られている（start() による接続）
    expect(MockWebSocket.instances.length).toBe(2);

    // 旧世代のタイマーを全部発火させる
    vi.runAllTimers();

    // タイマーは旧世代のものなので新たな WS は作られない
    // （connectionGeneration チェックにより connectWebSocket が呼ばれない）
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it("stop() のみの場合（start() なし）も旧世代タイマーが発火しても接続されない", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();

    // 異常切断 → reconnect タイマー登録
    ws0.simulateAbnormalClose(1006);
    expect(MockWebSocket.instances.length).toBe(1);

    // stop() → connectionGeneration インクリメント + intentionallyStopped=true
    service.stop();

    // タイマーを発火 → intentionallyStopped=true + 世代不一致 どちらかで防がれる
    vi.runAllTimers();

    expect(MockWebSocket.instances.length).toBe(1);
    expect(service.status).toBe("stopped");
  });

  it("異常切断後に stop()→start() で再起動した新接続が異常切断しても正常に再接続できる（世代チェックが新接続を妨げない）", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();

    // 1回目の異常切断 → reconnect タイマー登録 (世代=1)
    ws0.simulateAbnormalClose(1006);

    // stop()→start() で世代が変わる
    service.stop();
    const restartPromise = service.start();
    await flushPromises();
    await restartPromise;

    // 新接続 (ws1) が作られている
    expect(MockWebSocket.instances.length).toBe(2);
    const ws1 = MockWebSocket.instances[1];
    ws1.simulateOpen();

    // ws1 が異常切断 → 新世代のタイマーが登録される
    ws1.simulateAbnormalClose(1006);

    // 旧世代タイマーを含む全タイマーを発火
    vi.runAllTimers();

    // 新世代のタイマーが正常に動作して ws2 が作られる
    // 旧世代のタイマーは無効化されているので1回だけ新規 WS が作られるはず
    expect(MockWebSocket.instances.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// applySettings — deviceId/sttModel 変更時の再起動 (Bug A)
// ---------------------------------------------------------------------------

describe("VoiceInputService – applySettings restarts on device/model change (Bug A)", () => {
  let service: VoiceInputService;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;

    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, WebSocket));

    const mockStream = createMockMediaStream();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    setupAudioContextMock();

    service = new VoiceInputService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("isRunning=true の状態で deviceId を変更すると stop→start が呼ばれ新しい WebSocket が作られる", async () => {
    // 初回 start
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    expect(MockWebSocket.instances.length).toBe(1);
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();

    expect(service.isRunning).toBe(true);

    // deviceId を変更して applySettings を呼ぶ
    const applyPromise = service.applySettings({
      deviceId: "new-device-id",
      sttModel: "nova-3",
      enabled: true,
      confidenceThreshold: 0.3,
      endpointingMs: 200,
    });
    await flushPromises();
    await applyPromise;

    // 旧 WebSocket が閉じられ、新しい WebSocket が作られているはず
    expect(MockWebSocket.instances.length).toBe(2);
    expect(service.deviceId).toBe("new-device-id");
  });

  it("isRunning=true の状態で sttModel を変更すると stop→start が呼ばれ新しい WebSocket が作られる", async () => {
    // 初回 start
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    expect(MockWebSocket.instances.length).toBe(1);
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();

    expect(service.isRunning).toBe(true);

    // 旧 URL に nova-3 が含まれることを確認
    expect(ws0.url).toContain("model=nova-3");

    // sttModel を変更して applySettings を呼ぶ
    const applyPromise = service.applySettings({
      deviceId: "",
      sttModel: "nova-2",
      enabled: true,
      confidenceThreshold: 0.3,
      endpointingMs: 200,
    });
    await flushPromises();
    await applyPromise;

    // 新しい WebSocket が作られ、URL に新しいモデルが含まれているはず
    expect(MockWebSocket.instances.length).toBe(2);
    const ws1 = MockWebSocket.instances[1];
    expect(ws1.url).toContain("model=nova-2");
  });

  it("isRunning=true かつ deviceId も sttModel も変わらない場合は再起動しない", async () => {
    // 初回 start
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    expect(MockWebSocket.instances.length).toBe(1);
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();

    expect(service.isRunning).toBe(true);

    // 変更なしで applySettings を呼ぶ
    const applyPromise = service.applySettings({
      deviceId: "",
      sttModel: "nova-3",
      enabled: true,
      confidenceThreshold: 0.5,
      endpointingMs: 300,
    });
    await flushPromises();
    await applyPromise;

    // WebSocket の数は変わらない
    expect(MockWebSocket.instances.length).toBe(1);
    expect(service.isRunning).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stale stream 参照による二重オープン防止 (Bug 6 / R34)
// ---------------------------------------------------------------------------

describe("VoiceInputService – reconnect uses latest mediaStream, not stale closure stream (Bug 6)", () => {
  let service: VoiceInputService;
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;

    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, WebSocket));

    getUserMediaMock = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: getUserMediaMock,
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    setupAudioContextMock();

    service = new VoiceInputService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("applySettings でデバイス変更後の再接続クロージャが新しい stream (this.mediaStream) を使う", async () => {
    // mic-A の stream を返すモック
    const streamA = createMockMediaStream();
    // mic-B の stream を返すモック
    const streamB = createMockMediaStream();

    // 1 回目 getUserMedia は mic-A の stream を返す
    getUserMediaMock.mockResolvedValueOnce(streamA);

    // start() で mic-A の stream 取得
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    expect(MockWebSocket.instances.length).toBe(1);
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();

    // this.mediaStream が streamA であることを確認
    const getMediaStream = () =>
      (service as unknown as { mediaStream: MediaStream | null }).mediaStream;
    expect(getMediaStream()).toBe(streamA);

    // applySettings でデバイス変更 → stop() → start() が走る
    // 2 回目 getUserMedia は mic-B の stream を返す
    getUserMediaMock.mockResolvedValueOnce(streamB);

    const applyPromise = service.applySettings({
      deviceId: "mic-B",
      sttModel: "nova-3",
      enabled: true,
      confidenceThreshold: 0.3,
      endpointingMs: 200,
    });
    await flushPromises();
    await applyPromise;

    // 新しい WS が作られ、this.mediaStream が streamB に更新されている
    expect(MockWebSocket.instances.length).toBe(2);
    expect(getMediaStream()).toBe(streamB);

    const ws1 = MockWebSocket.instances[1];
    ws1.simulateOpen();

    // ws1 が異常切断 → reconnect タイマーが登録される
    ws1.simulateAbnormalClose(1006);
    expect(MockWebSocket.instances.length).toBe(2);

    // タイマーを進める → 再接続が走る
    vi.runAllTimers();

    // 新しい WS (#3) が作られている
    expect(MockWebSocket.instances.length).toBe(3);

    // ws2 の onopen で setupAudioProcessor が呼ばれるとき、
    // createMediaStreamSource に渡される stream が streamB であることを検証するため
    // AudioContext モックの createMediaStreamSource を spy する
    // ここでは this.mediaStream が streamB のままであることで間接的に検証する
    expect(getMediaStream()).toBe(streamB);
  });

  it("mediaStream が null の場合は再接続タイマー発火時に connectWebSocket が呼ばれない", async () => {
    const streamA = createMockMediaStream();
    getUserMediaMock.mockResolvedValueOnce(streamA);

    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    expect(MockWebSocket.instances.length).toBe(1);
    const ws0 = MockWebSocket.instances[0];
    ws0.simulateOpen();

    // 異常切断 → reconnect タイマー登録
    ws0.simulateAbnormalClose(1006);
    expect(MockWebSocket.instances.length).toBe(1);

    // mediaStream を強制的に null にする (stream が stop されたケースを模倣)
    (service as unknown as { mediaStream: MediaStream | null }).mediaStream =
      null;

    // タイマーを進める → mediaStream===null のガードで connectWebSocket が呼ばれない
    vi.runAllTimers();

    expect(MockWebSocket.instances.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// VoiceInputDiagnostics — メトリクス収集 (Issue #10)
// ---------------------------------------------------------------------------

describe("VoiceInputService – VoiceInputDiagnostics metrics collection (Issue #10)", () => {
  let service: VoiceInputService;
  let capturedProcessor: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onaudioprocess: ((e: AudioProcessingEvent) => void) | null;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;

    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, WebSocket));

    const mockStream = createMockMediaStream();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    capturedProcessor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null,
    };
    const mockGain = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1.0 },
    };
    const mockCompressor = {
      connect: vi.fn(),
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 1 },
      attack: { value: 0.003 },
      release: { value: 0.1 },
    };
    const mockSource = { connect: vi.fn() };

    class MockAudioContextCapture {
      state = "running";
      sampleRate = 16000;
      destination = {};
      createMediaStreamSource = vi.fn().mockReturnValue(mockSource);
      createGain = vi.fn().mockReturnValue(mockGain);
      createDynamicsCompressor = vi.fn().mockReturnValue(mockCompressor);
      createScriptProcessor = vi.fn().mockReturnValue(capturedProcessor);
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
    }

    vi.stubGlobal("AudioContext", MockAudioContextCapture);

    service = new VoiceInputService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("start() 前は getDiagnostics() がゼロ初期値を返す", () => {
    const d = service.getDiagnostics();
    expect(d.connectionUptimeMs).toBeNull();
    expect(d.framesSent).toBe(0);
    expect(d.lastFrameSentAt).toBeNull();
    expect(d.lastDisconnectReason).toBeNull();
    expect(d.errorCount).toBe(0);
    expect(d.reconnectAttempts).toBe(0);
    expect(d.wsReadyState).toBeNull();
  });

  it("WebSocket open 後に connectionUptimeMs が増加する", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // 2 秒進める
    vi.advanceTimersByTime(2000);

    const d = service.getDiagnostics();
    expect(d.connectionUptimeMs).not.toBeNull();
    expect(d.connectionUptimeMs).toBeGreaterThanOrEqual(2000);
    expect(d.wsReadyState).toBe(WebSocket.OPEN);
  });

  it("onaudioprocess が呼ばれると framesSent が増加する", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    await flushPromises();
    expect(capturedProcessor.onaudioprocess).not.toBeNull();

    // WS が OPEN のまま onaudioprocess を呼び出す
    const float32Data = new Float32Array([0.5, -0.3, 0.1]);
    const mockEvent = {
      inputBuffer: {
        getChannelData: vi.fn().mockReturnValue(float32Data),
      },
    } as unknown as AudioProcessingEvent;

    capturedProcessor.onaudioprocess?.(mockEvent);

    const d = service.getDiagnostics();
    expect(d.framesSent).toBe(1);
    expect(d.lastFrameSentAt).not.toBeNull();
  });

  it("onDiagnostics コールバックが 1 秒ごとに呼ばれる", async () => {
    const diagnosticsEvents: import("../types/voice_input").VoiceInputDiagnostics[] =
      [];
    const unsub = service.onDiagnostics((d) => diagnosticsEvents.push(d));

    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // 3 秒進める → 3 回コールバックが呼ばれるはず
    vi.advanceTimersByTime(3000);

    expect(diagnosticsEvents.length).toBeGreaterThanOrEqual(3);
    unsub();
  });

  it("stop() 後は onDiagnostics コールバックが呼ばれなくなる", async () => {
    const diagnosticsEvents: import("../types/voice_input").VoiceInputDiagnostics[] =
      [];
    const unsub = service.onDiagnostics((d) => diagnosticsEvents.push(d));

    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    vi.advanceTimersByTime(1000);
    const countBeforeStop = diagnosticsEvents.length;
    expect(countBeforeStop).toBeGreaterThanOrEqual(1);

    service.stop();

    // stop 後に時間を進めても増えない
    vi.advanceTimersByTime(3000);
    expect(diagnosticsEvents.length).toBe(countBeforeStop);
    unsub();
  });

  it("onDiagnostics の unsub を呼ぶとコールバックが解除される", async () => {
    const events: import("../types/voice_input").VoiceInputDiagnostics[] = [];
    const unsub = service.onDiagnostics((d) => events.push(d));

    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    vi.advanceTimersByTime(1000);
    const countAfterFirstTick = events.length;
    expect(countAfterFirstTick).toBeGreaterThanOrEqual(1);

    // unsub 後はイベントが来ない
    unsub();
    vi.advanceTimersByTime(2000);
    expect(events.length).toBe(countAfterFirstTick);
  });

  it("異常切断時に lastDisconnectReason が記録される", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // 異常切断 (code=1006)
    ws.simulateAbnormalClose(1006);

    const d = service.getDiagnostics();
    expect(d.lastDisconnectReason).toContain("1006");
  });

  it("start() 再呼び出し時にメトリクスがリセットされる", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    await flushPromises();

    // フレームを送信
    const float32Data = new Float32Array([0.5]);
    capturedProcessor.onaudioprocess?.({
      inputBuffer: { getChannelData: vi.fn().mockReturnValue(float32Data) },
    } as unknown as AudioProcessingEvent);

    expect(service.getDiagnostics().framesSent).toBe(1);

    // 異常切断 → reconnect タイマー発火前に stop
    ws.simulateAbnormalClose(1006);
    service.stop();

    // 再 start
    const restartPromise = service.start();
    await flushPromises();
    await restartPromise;

    const d = service.getDiagnostics();
    expect(d.framesSent).toBe(0);
    expect(d.lastFrameSentAt).toBeNull();
    expect(d.lastDisconnectReason).toBeNull();
    expect(d.errorCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Krisp BVC 統合テスト
// ---------------------------------------------------------------------------

// @livekit/krisp-noise-filter と livekit-client を mock
// LocalAudioTrack を class として mock する (arrow function は constructor になれないため)
vi.mock("@livekit/krisp-noise-filter", () => ({
  isKrispNoiseFilterSupported: vi.fn(),
  KrispNoiseFilter: vi.fn(),
}));

// LocalAudioTrack を class mock として定義
const mockSetProcessor = vi.fn().mockResolvedValue(undefined);
const mockStopProcessor = vi.fn().mockResolvedValue(undefined);

vi.mock("livekit-client", () => {
  class MockLocalAudioTrack {
    private _track: MediaStreamTrack;
    constructor(track: MediaStreamTrack) {
      this._track = track;
    }
    setProcessor = mockSetProcessor;
    stopProcessor = mockStopProcessor;
    get mediaStreamTrack() {
      return this._track;
    }
  }
  return { LocalAudioTrack: MockLocalAudioTrack };
});

describe("VoiceInputService – Krisp BVC integration", () => {
  let service: VoiceInputService;

  beforeEach(async () => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;

    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, WebSocket));

    const mockStream = createMockMediaStream();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    setupAudioContextMock();

    // MediaStream コンストラクタを jsdom 環境でサポートするようにスタブ
    // vi.fn().mockImplementation は arrow function になるため new が使えない
    // class 構文でコンストラクタとして機能させる
    class MockMediaStream {
      private _tracks: MediaStreamTrack[];
      constructor(tracks?: MediaStreamTrack[]) {
        this._tracks = tracks ?? [];
      }
      getTracks() {
        return this._tracks;
      }
      getAudioTracks() {
        return this._tracks;
      }
    }
    vi.stubGlobal("MediaStream", MockMediaStream);

    // mock 参照を取得してリセット
    const { isKrispNoiseFilterSupported: isSup, KrispNoiseFilter: knf } =
      await import("@livekit/krisp-noise-filter");
    vi.mocked(isSup).mockReturnValue(true);
    vi.mocked(knf).mockReturnValue({
      name: "livekit-noise-filter" as const,
      processedTrack: undefined,
      init: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      onPublish: vi.fn().mockResolvedValue(undefined),
      setEnabled: vi.fn().mockResolvedValue(undefined),
      isEnabled: vi.fn().mockReturnValue(true),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    // setProcessor/stopProcessor をリセット
    mockSetProcessor.mockReset().mockResolvedValue(undefined);
    mockStopProcessor.mockReset().mockResolvedValue(undefined);

    service = new VoiceInputService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("BVC サポート環境では bvcSupported=true かつ bvcEnabled=true が diagnostics に反映される", async () => {
    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const d = service.getDiagnostics();
    expect(d.bvcSupported).toBe(true);
    expect(d.bvcEnabled).toBe(true);
  });

  it("BVC 非サポート環境 (isKrispNoiseFilterSupported=false) では bvcSupported=false かつ bvcEnabled=false で fallback する", async () => {
    const { isKrispNoiseFilterSupported: isSup } = await import(
      "@livekit/krisp-noise-filter"
    );
    vi.mocked(isSup).mockReturnValue(false);

    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const d = service.getDiagnostics();
    expect(d.bvcSupported).toBe(false);
    expect(d.bvcEnabled).toBe(false);
  });

  it("setProcessor が例外を投げた場合は fallback し bvcEnabled=false になる", async () => {
    mockSetProcessor.mockRejectedValueOnce(new Error("WORKLET_NOT_SUPPORTED"));

    const startPromise = service.start();
    await flushPromises();
    await startPromise;

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const d = service.getDiagnostics();
    expect(d.bvcSupported).toBe(true);
    expect(d.bvcEnabled).toBe(false);
  });

  it("start() 前は bvcEnabled=false, bvcSupported=false (初期値)", () => {
    const d = service.getDiagnostics();
    expect(d.bvcEnabled).toBe(false);
    expect(d.bvcSupported).toBe(false);
  });
});
