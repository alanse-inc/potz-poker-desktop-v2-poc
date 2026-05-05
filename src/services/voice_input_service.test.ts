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
  const mockGain = { connect: vi.fn(), gain: { value: 1.0 } };
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
