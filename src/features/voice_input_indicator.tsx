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

// lucide-react は v2 の依存に含まれないため、SVG をインラインで定義する。
// パスは lucide-react の Mic / MicOff アイコンと同一。
function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

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

  // 認識中の経過時間を 0.01 秒刻み（2 桁表示）で live 表示する。
  // status が active になった瞬間の時刻を ref に記録し、50ms ごとに
  // 経過秒を再計算して state を更新する。listening 等に戻ったら 0 にリセット。
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
    }, 50);
    return () => clearInterval(interval);
  }, [showActiveBorder]);

  // v2 の voiceInputService は muted 概念を持たないため、
  // status === "stopped" を OFF（マイク無効）として扱う。
  const isOff = status === "stopped";

  // ON/OFF は stop() / start() で切り替える。
  // start() 内部に二重起動ガード (isRunning / startPromise 待ち) があるため
  // 連打しても安全。
  const handleToggleMic = (): void => {
    if (isOff) {
      void voiceInputService.start();
    } else {
      voiceInputService.stop();
    }
  };

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
                s{elapsedSec.toFixed(2)}
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
                  s{(log.processingTime / 1000).toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1">
          <div className="relative">
            <div
              className={`h-2 w-2 rounded-full ${isOff ? STATUS_COLORS.stopped : STATUS_COLORS[status]}`}
            />
            {status !== "error" && status !== "stopped" && (
              <div
                className={`absolute inset-0 h-2 w-2 animate-ping rounded-full opacity-75 ${STATUS_COLORS[status]}`}
              />
            )}
          </div>
          <span
            className="inline-block min-w-[2.5em] text-center text-white"
            style={{ fontSize: "10px" }}
          >
            {STATUS_LABELS[status]}
          </span>
          <button
            type="button"
            aria-label={isOff ? "マイクをオンにする" : "マイクをオフにする"}
            onClick={handleToggleMic}
            className={
              isOff
                ? "flex h-11 w-11 items-center justify-center rounded-full bg-red-500 hover:bg-red-500/90"
                : "flex h-11 w-11 items-center justify-center rounded-full bg-white hover:bg-white/90"
            }
          >
            {isOff ? (
              <MicOffIcon className="h-6 w-6 text-white" />
            ) : (
              <MicIcon className="h-6 w-6 text-gray-800" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
