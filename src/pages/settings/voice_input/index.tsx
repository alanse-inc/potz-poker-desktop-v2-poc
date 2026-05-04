import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import {
  STATUS_COLORS,
  STATUS_LABELS,
} from "../../../services/voice_input_constants";
import {
  type AudioDevice,
  voiceInputService,
} from "../../../services/voice_input_service";
import type {
  VoiceInputStatus,
  VoiceInputStatusEvent,
  VoicePokerCommand,
} from "../../../types/voice_input";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";

const ACTION_COLORS: Record<string, string> = {
  bet: "text-yellow-400",
  raise: "text-yellow-400",
  call: "text-green-400",
  fold: "text-red-400",
  check: "text-blue-400",
  "all-in": "text-purple-400",
  expose: "text-gray-400",
};

const ACTION_LABELS: Record<string, string> = {
  bet: "BET",
  raise: "RAISE",
  call: "CALL",
  fold: "FOLD",
  check: "CHECK",
  "all-in": "ALL-IN",
  expose: "EXPOSE",
};

const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY as
  | string
  | undefined;

export function VoiceInputSettings() {
  const navigate = useNavigate();
  const [isEnabled, setIsEnabled] = useState(voiceInputService.enabled);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>(
    voiceInputService.deviceId ?? "",
  );
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [status, setStatus] = useState<VoiceInputStatus>(
    voiceInputService.status,
  );
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(
    voiceInputService.confidenceThreshold,
  );
  const [endpointingMs, setEndpointingMs] = useState<number>(
    voiceInputService.endpointingMs,
  );
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isMicTestRunning, setIsMicTestRunning] = useState(false);
  const [commandLog, setCommandLog] = useState<VoicePokerCommand[]>([]);

  const apiKeyMissing = !DEEPGRAM_API_KEY;

  useEffect(() => {
    voiceInputService
      .getAudioDevices()
      .then(setAudioDevices)
      .catch(() => {});

    const unsubStatus = voiceInputService.onStatus(
      (event: VoiceInputStatusEvent) => {
        setStatus(event.status);
        setStatusMessage(event.message ?? "");
      },
    );

    const unsubCommand = voiceInputService.onCommand(
      (command: VoicePokerCommand) => {
        setCommandLog((prev) => [command, ...prev].slice(0, 50));
      },
    );

    return () => {
      unsubStatus();
      unsubCommand();
      if (isMicTestRunning) {
        voiceInputService.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMicTestRunning]);

  const handleToggle = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  const handleMicTestStart = useCallback(async () => {
    if (apiKeyMissing) {
      toast.error("VITE_DEEPGRAM_API_KEY が設定されていません");
      return;
    }
    try {
      setIsMicTestRunning(true);
      await voiceInputService.start();
    } catch (error) {
      console.error(
        `マイクテストに失敗しました: ${error instanceof Error ? error.message || error.name : String(error)}`,
      );
      setIsMicTestRunning(false);
    }
  }, [apiKeyMissing]);

  const handleMicTestStop = useCallback(() => {
    voiceInputService.stop();
    setIsMicTestRunning(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (isMicTestRunning) {
      voiceInputService.stop();
      setIsMicTestRunning(false);
    }
    try {
      await voiceInputService.applySettings({
        deviceId: currentDeviceId,
        sttModel: "nova-3",
        enabled: isEnabled,
        confidenceThreshold,
        endpointingMs,
      });
      toast.success("音声入力設定を保存しました");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "設定の保存に失敗しました";
      toast.error(msg);
    }
  }, [
    isMicTestRunning,
    currentDeviceId,
    isEnabled,
    confidenceThreshold,
    endpointingMs,
  ]);

  return (
    <BasicPage scrollable>
      <div className="flex w-full max-w-md flex-col gap-6 p-8">
        <h1 className="text-center font-bold text-2xl text-primary">
          音声入力設定
        </h1>

        {/* API キー未設定の警告 */}
        {apiKeyMissing && (
          <div className="rounded-lg border border-yellow-600 bg-yellow-900/30 px-4 py-3">
            <p className="font-bold text-sm text-yellow-400">APIキー未設定</p>
            <p className="mt-1 text-gray-300 text-xs">
              <code className="rounded bg-gray-800 px-1">
                VITE_DEEPGRAM_API_KEY
              </code>{" "}
              を .env ファイルに設定してください。 音声入力を使用するには
              Deepgram の API キーが必要です。
            </p>
          </div>
        )}

        {/* 音声入力 ON/OFF */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm text-white">音声入力</span>
          <button
            type="button"
            onClick={handleToggle}
            disabled={apiKeyMissing}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
              apiKeyMissing ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            } ${isEnabled ? "bg-green-500" : "bg-gray-600"}`}
          >
            <span
              className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${isEnabled ? "translate-x-7" : "translate-x-1"}`}
            />
          </button>
        </div>

        {/* マイク選択 */}
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="microphone-select"
            className="font-bold text-sm text-white"
          >
            マイク
          </label>
          <select
            id="microphone-select"
            value={currentDeviceId}
            onChange={(e) => setCurrentDeviceId(e.target.value)}
            className="w-48 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">デフォルト</option>
            {audioDevices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `マイク ${index + 1}`}
              </option>
            ))}
          </select>
        </div>

        {/* 信頼度閾値 */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm text-white">
            信頼度閾値 ({(confidenceThreshold * 100).toFixed(0)}%)
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={confidenceThreshold * 100}
            onChange={(e) =>
              setConfidenceThreshold(Number(e.target.value) / 100)
            }
            className="w-48 accent-primary"
          />
        </div>

        {/* 発話終了検出 */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm text-white">
            発話終了検出 ({endpointingMs}ms)
          </span>
          <input
            type="range"
            min="50"
            max="1000"
            step="50"
            value={endpointingMs}
            onChange={(e) => setEndpointingMs(Number(e.target.value))}
            className="w-48 accent-primary"
          />
        </div>

        {/* マイクテスト */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm text-white">音声テスト</span>
          <button
            type="button"
            disabled={apiKeyMissing}
            onClick={isMicTestRunning ? handleMicTestStop : handleMicTestStart}
            className={`rounded-lg px-6 py-2 text-sm transition-colors ${
              apiKeyMissing
                ? "cursor-not-allowed bg-gray-700 text-gray-500"
                : isMicTestRunning
                  ? "bg-red-500 text-white hover:bg-red-400"
                  : "bg-primary text-black hover:brightness-110"
            }`}
          >
            {isMicTestRunning ? "STOP" : "START"}
          </button>
        </div>

        {/* ステータス */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`h-3 w-3 rounded-full ${STATUS_COLORS[status]}`} />
            {status !== "stopped" && status !== "error" && (
              <div
                className={`absolute inset-0 h-3 w-3 animate-ping rounded-full opacity-75 ${STATUS_COLORS[status]}`}
              />
            )}
          </div>
          <span className="text-gray-300 text-sm">
            {STATUS_LABELS[status]}
            {statusMessage && ` — ${statusMessage}`}
          </span>
        </div>

        {/* コマンドログ */}
        {commandLog.length > 0 && (
          <div
            className="flex flex-col gap-1 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-2"
            style={{ maxHeight: "200px" }}
          >
            {commandLog.map((cmd, i) => (
              <div
                key={`${cmd.timestamp}-${i}`}
                className="flex flex-col gap-0.5 border-gray-800 border-b py-1.5 last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold text-sm ${
                        cmd.action !== null
                          ? (ACTION_COLORS[cmd.action] ?? "text-white")
                          : "text-white"
                      }`}
                    >
                      {cmd.action !== null
                        ? (ACTION_LABELS[cmd.action] ?? cmd.action)
                        : "—"}
                    </span>
                    {cmd.amount != null && (
                      <span className="font-semibold text-white text-xs">
                        {cmd.amount.toLocaleString()}
                      </span>
                    )}
                    <span className="text-gray-500 text-xs">
                      "{cmd.rawText}"
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs">
                    {(cmd.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ボタン */}
        <div className="flex flex-col gap-3">
          <RoundButton
            type="primary"
            size="full"
            text="保存"
            onClick={handleSave}
            disabled={apiKeyMissing}
          />
          <RoundButton
            type="black"
            size="full"
            text="戻る"
            onClick={() => navigate("/")}
          />
        </div>
      </div>
    </BasicPage>
  );
}
