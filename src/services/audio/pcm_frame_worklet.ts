/**
 * AudioContext に PCM フレーム生成 AudioWorklet を登録し、
 * MediaStream → AudioWorkletNode → コールバック の経路を構築するヘルパー。
 *
 * 20ms (320 sample @16kHz) Float32 フレームを onFrame コールバックで通知する。
 *
 * Vite の `?url` 修飾子でプロセッサスクリプトを URL として取得し、
 * `audioContext.audioWorklet.addModule(url)` で登録する。
 * テスト環境 (vitest + jsdom) では動的 import に分離することで
 * worker プラグインの依存を避ける。
 */

export interface PcmFrameWorkletHandle {
  dispose: () => Promise<void>;
}

export interface AttachPcmFrameWorkletOptions {
  onFrame: (payload: {
    data: Float32Array;
    sequenceNumber: number;
    timestampMs: number;
  }) => void;
}

export async function attachPcmFrameWorklet(
  audioContext: AudioContext,
  stream: MediaStream,
  options: AttachPcmFrameWorkletOptions,
): Promise<PcmFrameWorkletHandle> {
  const workletUrlModule = (await import(
    "./pcm_frame_worklet_processor?url"
  )) as { default: string };
  await audioContext.audioWorklet.addModule(workletUrlModule.default);

  if (audioContext.state === "closed") {
    throw new DOMException(
      "AudioContext was closed during attachPcmFrameWorklet",
      "InvalidStateError",
    );
  }

  const source = audioContext.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(audioContext, "pcm-frame-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: "explicit",
  });

  source.connect(node);

  node.port.onmessage = (event) => {
    const payload = event.data as {
      data: Float32Array;
      sequenceNumber: number;
      timestampMs: number;
    };
    options.onFrame(payload);
  };

  const dispose = async (): Promise<void> => {
    try {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
    } catch {
      // noop
    }
  };

  return { dispose };
}
