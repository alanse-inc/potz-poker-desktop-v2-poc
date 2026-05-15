/**
 * pcm_frame_worklet.ts のインターフェース互換テスト
 *
 * 実際の AudioContext / AudioWorklet は jsdom 環境で動かないため、
 * モックを通して API 設計 (型・呼び出し契約) を検証する。
 */

import { describe, expect, it, vi } from "vitest";
import {
  type AttachPcmFrameWorkletOptions,
  attachPcmFrameWorklet,
  type PcmFrameWorkletHandle,
} from "./pcm_frame_worklet";

vi.mock("./pcm_frame_worklet_processor?url", () => ({
  default: "blob:mock-processor-url",
}));

let _mockNodeRef: {
  port: {
    onmessage: ((e: MessageEvent) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
} | null = null;

function buildMockAudioContext(state: AudioContextState = "running") {
  const mockNode = {
    port: {
      onmessage: null as ((e: MessageEvent) => void) | null,
      postMessage: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  _mockNodeRef = mockNode;

  const mockSource = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const mockWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };

  const ctx = {
    state,
    sampleRate: 16000,
    audioWorklet: mockWorklet,
    createMediaStreamSource: vi.fn().mockReturnValue(mockSource),
  } as unknown as AudioContext;

  // AudioWorkletNode は constructor として呼ばれるため class 構文で定義する
  class MockAudioWorkletNode {
    port = mockNode.port;
    connect = mockNode.connect;
    disconnect = mockNode.disconnect;
  }
  vi.stubGlobal("AudioWorkletNode", MockAudioWorkletNode);

  return { ctx, mockNode, mockSource, mockWorklet };
}

function buildMockStream(): MediaStream {
  return {
    getTracks: () => [],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

describe("attachPcmFrameWorklet – interface contract", () => {
  it("PcmFrameWorkletHandle が dispose メソッドを持つ", async () => {
    const { ctx } = buildMockAudioContext();
    const stream = buildMockStream();
    const onFrame = vi.fn();

    const handle: PcmFrameWorkletHandle = await attachPcmFrameWorklet(
      ctx,
      stream,
      { onFrame },
    );

    expect(typeof handle.dispose).toBe("function");
    await expect(handle.dispose()).resolves.toBeUndefined();
  });

  it("audioWorklet.addModule が processor URL で呼ばれる", async () => {
    const { ctx, mockWorklet } = buildMockAudioContext();
    const stream = buildMockStream();

    await attachPcmFrameWorklet(ctx, stream, { onFrame: vi.fn() });

    expect(mockWorklet.addModule).toHaveBeenCalledWith(
      "blob:mock-processor-url",
    );
  });

  it("audioContext.state が closed の場合に InvalidStateError を投げる", async () => {
    const { ctx, mockWorklet } = buildMockAudioContext("closed");
    // addModule は成功するが、その後 state チェックで例外が出る
    mockWorklet.addModule.mockResolvedValue(undefined);

    const stream = buildMockStream();
    await expect(
      attachPcmFrameWorklet(ctx, stream, { onFrame: vi.fn() }),
    ).rejects.toMatchObject({ name: "InvalidStateError" });
  });

  it("onFrame コールバックが node.port.onmessage 経由で呼ばれる", async () => {
    const { ctx, mockNode } = buildMockAudioContext();
    const stream = buildMockStream();
    const onFrame = vi.fn();

    const options: AttachPcmFrameWorkletOptions = { onFrame };
    await attachPcmFrameWorklet(ctx, stream, options);

    // port.onmessage が設定されていること
    expect(mockNode.port.onmessage).not.toBeNull();

    // フレームデータを postMessage でシミュレート
    const frameData = new Float32Array([0.1, -0.2, 0.3]);
    const fakeEvent = {
      data: {
        data: frameData,
        sequenceNumber: 42,
        timestampMs: 12345,
      },
    } as unknown as MessageEvent;

    mockNode.port.onmessage(fakeEvent);

    expect(onFrame).toHaveBeenCalledWith({
      data: frameData,
      sequenceNumber: 42,
      timestampMs: 12345,
    });
  });

  it("dispose が node.port.onmessage を null に設定し disconnect を呼ぶ", async () => {
    const { ctx, mockNode, mockSource } = buildMockAudioContext();
    const stream = buildMockStream();

    const handle = await attachPcmFrameWorklet(ctx, stream, {
      onFrame: vi.fn(),
    });
    await handle.dispose();

    expect(mockNode.port.onmessage).toBeNull();
    expect(mockSource.disconnect).toHaveBeenCalled();
    expect(mockNode.disconnect).toHaveBeenCalled();
  });
});
