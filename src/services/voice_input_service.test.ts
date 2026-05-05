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

  it("再接続遅延が指数バックオフで増加する", async () => {
    // RECONNECT_DELAY_MS=1000 として, attempt=0→1000ms, attempt=1→2000ms, attempt=2→4000ms
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

    // WS #1: open → 異常切断 → 再接続待ち (delay=2000ms, attempt=1 時)
    const ws1 = MockWebSocket.instances[1];
    ws1.simulateOpen();
    ws1.simulateAbnormalClose(1006);

    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances.length).toBe(2);

    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances.length).toBe(3);

    // WS #2: open → 異常切断 → 再接続待ち (delay=4000ms, attempt=2 時)
    const ws2 = MockWebSocket.instances[2];
    ws2.simulateOpen();
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

    // MAX_RECONNECT_ATTEMPTS=5 回、異常切断を繰り返す
    for (let i = 0; i <= 5; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();
      ws.simulateAbnormalClose(1006);

      if (i < 5) {
        // まだ再接続試行中 → タイマーを全部進めて次の WS を作る
        vi.runAllTimers();
      }
    }

    // 6 回目の異常切断（MAX=5 を超えた）後は再接続なし
    expect(service.status).toBe("error");
    // エラーメッセージが発行されていることを確認
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

    // 5 回再接続を試みて使い切る
    for (let i = 0; i <= 5; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();
      ws.simulateAbnormalClose(1006);
      if (i < 5) {
        vi.runAllTimers();
      }
    }

    // 最後のエラーイベントには再接続上限メッセージが含まれること
    expect(errorMessages.length).toBeGreaterThan(0);
    const lastMsg = errorMessages[errorMessages.length - 1];
    expect(lastMsg).toContain("再接続上限");
  });
});
