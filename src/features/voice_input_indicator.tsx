import { useEffect, useRef, useState } from "react";
import { STATUS_COLORS } from "../services/voice_input_constants";
import { voiceInputService } from "../services/voice_input_service";
import type {
  VoiceInputStatus,
  VoiceInputStatusEvent,
  VoicePokerAction,
} from "../types/voice_input";
import { formatChipWithSuffix } from "./chip/format_chip_with_suffix";

const STATUS_LABELS: Record<VoiceInputStatus, string> = {
  stopped: "OFF",
  listening: "ON",
  speaking: "発話検出",
  processing: "解析中",
  error: "エラー",
};

// アクションログのテキスト色。Footer のアクションボタン配色と一致させ、
// 配信ゲーム画面内の「ボタン → 実行 → ログ」が同色で繋がるようにする。
export const ACTION_COLORS: Record<VoicePokerAction, string> = {
  fold: "#4F4F4F",
  check: "#2F80ED",
  call: "#2F80ED",
  bet: "#F97316",
  raise: "#F97316",
  "all-in": "#CAFF33",
  expose: "#E5C46B",
  back: "#9CA3AF",
  ok: "#9CA3AF",
  "check-around": "#1D4ED8",
};

export const ACTION_LABELS: Record<VoicePokerAction, string> = {
  fold: "FOLD",
  check: "CHECK",
  call: "CALL",
  bet: "BET",
  raise: "RAISE",
  "all-in": "ALL-IN",
  expose: "EXPOSE",
  back: "BACK",
  ok: "OK",
  "check-around": "CHECK AROUND",
};

export type VoiceCommandLogEntry = {
  action: VoicePokerAction;
  amount: number | null;
  seatNumber: number | null;
  timestamp: number;
  /** STT + LLM の合計処理時間 (ms)。VoicePokerCommand.processingTime 由来。 */
  processingTime?: number;
};

type Props = {
  commandLog?: VoiceCommandLogEntry[];
};

export function VoiceInputIndicator({ commandLog }: Props) {
  const [status, setStatus] = useState<VoiceInputStatus>(
    voiceInputService.status,
  );

  useEffect(() => {
    const unsub = voiceInputService.onStatus((event: VoiceInputStatusEvent) => {
      setStatus(event.status);
    });
    return unsub;
  }, []);

  // 音声 AI が発話を検出 / 解析中の状態は画面全体で視認できるよう
  // 外縁に lime のグローを点滅させる。listening (待機) / error 時は
  // 画面操作の妨げにならないよう枠は出さない（右下バッジで状態確認）。
  const showActiveBorder = status === "speaking" || status === "processing";

  // 認識中の経過時間を 0.1 秒刻みで live 表示する。
  const activeStartRef = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!showActiveBorder) {
      activeStartRef.current = null;
      setElapsedSec(0);
      return;
    }
    if (activeStartRef.current === null) {
      activeStartRef.current = Date.now();
    }
    const interval = setInterval(() => {
      if (activeStartRef.current !== null) {
        setElapsedSec((Date.now() - activeStartRef.current) / 1000);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [showActiveBorder]);

  if (status === "stopped") return null;

  return (
    <>
      {showActiveBorder && (
        <>
          {/* スクリム: 認識中はエフェクト以外を軽く暗転 */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-30 bg-black/30"
          />
          {/* 中央パネル: 3 ドット bounce + 経過秒 */}
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
            <div className="flex items-center gap-4 rounded-xl bg-black/75 px-6 py-4 shadow-xl backdrop-blur-sm">
              <div className="flex items-end gap-1.5">
                <span className="block h-3 w-3 animate-bounce rounded-full bg-primary" />
                <span className="block h-3 w-3 animate-bounce rounded-full bg-primary [animation-delay:0.15s]" />
                <span className="block h-3 w-3 animate-bounce rounded-full bg-primary [animation-delay:0.3s]" />
              </div>
              <span
                className="font-mono text-white text-xl tabular-nums"
                aria-live="polite"
              >
                s{elapsedSec.toFixed(1)}
              </span>
            </div>
          </div>
        </>
      )}
      <div className="fixed right-3 bottom-3 z-50 flex flex-col items-end gap-1">
        <div
          style={{
            overflowY: "auto",
            maxHeight: "120px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            alignItems: "flex-end",
          }}
        >
          {commandLog?.slice(0, 5).map((log, i) => (
            <div
              key={`${log.timestamp}-${i}`}
              className="flex items-center gap-1.5 rounded px-2 py-0.5"
              style={{
                backgroundColor: "rgba(0,0,0,0.6)",
                opacity: 1 - i * 0.18,
                width: "160px",
              }}
            >
              {log.seatNumber != null && (
                <span className="text-gray-300" style={{ fontSize: "10px" }}>
                  シート{log.seatNumber}
                </span>
              )}
              <span
                className="font-bold"
                style={{ color: ACTION_COLORS[log.action], fontSize: "10px" }}
              >
                {ACTION_LABELS[log.action]}
              </span>
              {log.amount != null && (
                <span className="text-gray-300" style={{ fontSize: "10px" }}>
                  {formatChipWithSuffix(log.amount)}
                </span>
              )}
              {log.processingTime != null && (
                <span
                  className="ml-auto font-mono text-gray-400 tabular-nums"
                  style={{ fontSize: "9px" }}
                  title={`STT + LLM 処理時間 ${log.processingTime}ms`}
                >
                  s{(log.processingTime / 1000).toFixed(1)}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1">
          <div className="relative">
            <div className={`h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} />
            {status !== "error" && (
              <div
                className={`absolute inset-0 h-2 w-2 animate-ping rounded-full opacity-75 ${STATUS_COLORS[status]}`}
              />
            )}
          </div>
          <span className="text-white" style={{ fontSize: "10px" }}>
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>
    </>
  );
}
