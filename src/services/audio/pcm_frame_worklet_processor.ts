/// <reference types="@types/audioworklet" />

/**
 * AudioWorkletProcessor: マイク入力を 320 sample (20ms @16kHz) 単位の Float32 PCM に
 * バッファリングして main thread に postMessage する。
 *
 * - AudioWorkletProcessor.process() は 128 sample 固定で呼ばれる
 * - FRAME_SIZE (320) sample に達したら 1 フレームを送出
 * - data.buffer を Transferable で渡しコピーゼロにする
 *
 * このファイルは Vite の `?url` 修飾子で URL として import し、
 * `audioContext.audioWorklet.addModule(url)` で読み込む。
 * AudioContext の sampleRate は 16000 を前提とする。
 */

const FRAME_SIZE = 320;

class PcmFrameProcessor extends AudioWorkletProcessor {
  private buffer = new Float32Array(FRAME_SIZE);
  private bufferOffset = 0;
  private sequenceNumber = 0;

  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const channel = input[0];
    if (!channel) {
      return true;
    }

    let cursor = 0;
    while (cursor < channel.length) {
      const remainingInBuffer = FRAME_SIZE - this.bufferOffset;
      const remainingInChannel = channel.length - cursor;
      const copyCount = Math.min(remainingInBuffer, remainingInChannel);

      this.buffer.set(
        channel.subarray(cursor, cursor + copyCount),
        this.bufferOffset,
      );
      this.bufferOffset += copyCount;
      cursor += copyCount;

      if (this.bufferOffset >= FRAME_SIZE) {
        const frameToSend = this.buffer;
        this.port.postMessage(
          {
            data: frameToSend,
            sequenceNumber: this.sequenceNumber,
            timestampMs: Date.now(),
          },
          [frameToSend.buffer],
        );
        this.sequenceNumber += 1;
        this.buffer = new Float32Array(FRAME_SIZE);
        this.bufferOffset = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-frame-processor", PcmFrameProcessor);
