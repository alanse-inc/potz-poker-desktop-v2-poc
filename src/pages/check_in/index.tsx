import type { Html5QrcodeResult } from "html5-qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  BackendApiError,
  checkinPlayer,
  type GameEventDetailResponse,
  getGameEventDetail,
  getHealth,
  getPlayer,
  listGameEvents,
  type PlayerResponse,
} from "../../api/backend";
import { useBoard } from "../../contexts/board_context";
import { RoundButton } from "../../ui/button/round_button";
import { BasicPage } from "../../ui/page/basic";
import { QrScanner } from "./components/qr_scanner";
import { extractPlayerId } from "./extract_player_id";
import { useUsbQrReader } from "./hooks/useUsbQrReader";

const DEFAULT_VENUE_ID =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_DEFAULT_VENUE_ID
    ? import.meta.env.VITE_DEFAULT_VENUE_ID
    : "e2e00000000000b0";

type Step = "scan" | "selectEvent" | "stackInput" | "complete";

type CheckInState = {
  playerId: string;
  nickName: string;
  avatarUrl: string | null;
  stackAmount: number;
};

/**
 * チェックイン画面
 *
 * QRスキャン → スタック入力 → チェックイン実行 → 連続チェックイン
 */
export function CheckIn() {
  const { board, refresh: refreshBoard } = useBoard();

  const [mode, setMode] = useState<"camera" | "usb">("usb");
  const [step, setStep] = useState<Step>("scan");
  const [gameEvents, setGameEvents] = useState<GameEventDetailResponse[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [pendingPlayer, setPendingPlayer] = useState<CheckInState | null>(null);
  const [stackInput, setStackInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isProcessingRef = useRef(false);

  const autoSelectEvent = useCallback((detail: GameEventDetailResponse) => {
    setSelectedEventId(detail.gameEventId);
    const session = detail.sessions[0];
    if (session) {
      setSelectedSessionId(session.gameSessionId);
    }
  }, []);

  // backend 接続確認 + イベント一覧取得
  useEffect(() => {
    (async () => {
      try {
        await getHealth();
      } catch {
        toast.error("バックエンドへの接続に失敗しました");
      }

      try {
        const events = await listGameEvents({
          venueId: DEFAULT_VENUE_ID,
          statuses: "started,pending",
        });
        if (events.length === 0) {
          toast.error("進行中のイベントが見つかりませんでした");
          return;
        }
        // 詳細取得（sessions 含む）。1件失敗しても他のイベントは表示する
        const settled = await Promise.allSettled(
          events.map((e) => getGameEventDetail(e.gameEventId)),
        );
        const details = settled
          .filter(
            (r): r is PromiseFulfilledResult<GameEventDetailResponse> =>
              r.status === "fulfilled",
          )
          .map((r) => r.value);
        const failedCount = settled.length - details.length;
        if (failedCount > 0) {
          toast.error(`${failedCount} 件のイベント詳細取得に失敗しました`);
        }
        if (details.length === 0) {
          return;
        }
        setGameEvents(details);
        if (details.length === 1) {
          autoSelectEvent(details[0]);
        } else {
          setStep("selectEvent");
        }
      } catch (err) {
        toast.error(
          err instanceof BackendApiError
            ? `イベント取得エラー: ${err.detail}`
            : "イベント一覧の取得に失敗しました",
        );
      }
    })();
  }, [autoSelectEvent]);

  const handleSelectEvent = useCallback(
    (detail: GameEventDetailResponse) => {
      autoSelectEvent(detail);
      setStep("scan");
    },
    [autoSelectEvent],
  );

  /** QRコード読み取り共通処理 */
  const handleDecode = useCallback(async (text: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsLoading(true);

    try {
      const playerId = extractPlayerId(text);
      if (!playerId) {
        toast.error("無効な QR コードです");
        return;
      }

      const player: PlayerResponse = await getPlayer(playerId);
      setPendingPlayer({
        playerId: player.playerId,
        nickName: player.nickName,
        avatarUrl: player.avatarUrlSmall,
        stackAmount: 0,
      });
      setStackInput("");
      setStep("stackInput");
    } catch (err) {
      if (err instanceof BackendApiError && err.status === 404) {
        toast.error("プレイヤーが見つかりません");
      } else {
        toast.error(
          err instanceof Error
            ? err.message
            : "プレイヤー情報の取得に失敗しました",
        );
      }
    } finally {
      setIsLoading(false);
      // 少し待ってから次スキャンを受け付ける
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    }
  }, []);

  const handleScanSuccess = useCallback(
    (_decodedText: string, _result: Html5QrcodeResult) => {
      handleDecode(_decodedText);
    },
    [handleDecode],
  );

  const handleUsbInput = useCallback(
    (text: string) => {
      handleDecode(text);
    },
    [handleDecode],
  );

  useUsbQrReader(handleUsbInput, mode === "usb" && step === "scan");

  const handleStackSubmit = useCallback(async () => {
    if (!pendingPlayer || !selectedEventId || !selectedSessionId) {
      toast.error("セッション情報が取得できていません");
      return;
    }

    const amount = Number.parseInt(stackInput, 10);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("有効なスタック額を入力してください");
      return;
    }

    setIsLoading(true);
    try {
      await checkinPlayer({
        gameEventId: selectedEventId,
        gameSessionId: selectedSessionId,
        playerId: pendingPlayer.playerId,
      });

      // board が SHOWDOWN 状態の場合のみ addPlayer を試みる
      if (board?.phase === "showdown") {
        try {
          const { api } = await import("../../api/client");
          await api.board.addPlayer(pendingPlayer.nickName);
          await refreshBoard();
        } catch {
          // addPlayer 失敗は無視（次のゲームで反映予定の旨をトースト）
          toast("次のゲーム開始時にプレイヤーが反映される予定です");
        }
      } else {
        toast("次のゲーム開始時にプレイヤーが反映される予定です");
      }

      toast.success(`${pendingPlayer.nickName} のチェックインが完了しました`);
      setStep("complete");

      // 少し待ってスキャンステップに戻る
      setTimeout(() => {
        setPendingPlayer(null);
        setStackInput("");
        isProcessingRef.current = false;
        setStep("scan");
      }, 2000);
    } catch (err) {
      if (err instanceof BackendApiError) {
        if (err.status === 422) {
          toast.error("このプレイヤーはすでにチェックイン済みです");
        } else {
          toast.error(`チェックインエラー: ${err.detail}`);
        }
      } else {
        toast.error("チェックインの作成に失敗しました");
      }
      // エラー時はスキャンに戻る (ロックも確実に解除)
      setPendingPlayer(null);
      isProcessingRef.current = false;
      setStep("scan");
    } finally {
      setIsLoading(false);
    }
  }, [
    pendingPlayer,
    selectedEventId,
    selectedSessionId,
    stackInput,
    board,
    refreshBoard,
  ]);

  const handleCancel = useCallback(() => {
    setPendingPlayer(null);
    setStackInput("");
    isProcessingRef.current = false;
    setStep("scan");
  }, []);

  return (
    <BasicPage scrollable>
      <div className="flex w-full flex-col items-start gap-6 p-8">
        <div className="flex w-full items-center justify-between">
          <h1 className="font-bold text-2xl text-primary">
            プレイヤーチェックイン
          </h1>
          {step === "scan" && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-white">モード:</span>
              <button
                type="button"
                onClick={() =>
                  setMode((m) => (m === "camera" ? "usb" : "camera"))
                }
                className={`rounded-full px-4 py-1.5 font-bold text-sm transition ${
                  mode === "camera"
                    ? "bg-primary text-black"
                    : "border border-border-white bg-black-deep text-white"
                }`}
              >
                {mode === "camera" ? "カメラ" : "USB QR リーダー"}
              </button>
            </div>
          )}
        </div>

        {/* イベント選択ステップ */}
        {step === "selectEvent" && (
          <div className="flex w-full flex-col gap-4">
            <p className="text-white">参加するイベントを選択してください</p>
            {gameEvents.map((ev) => (
              <button
                key={ev.gameEventId}
                type="button"
                onClick={() => handleSelectEvent(ev)}
                className="w-full rounded-lg border border-border-white bg-black-deep px-6 py-4 text-left text-white transition hover:bg-white/10"
              >
                <div className="font-bold">{ev.gameName}</div>
                <div className="mt-1 text-gray-400 text-sm">
                  {ev.status === "started" ? "進行中" : "開始待ち"} /{" "}
                  {ev.gameFormat === "ring_game"
                    ? "リングゲーム"
                    : "トーナメント"}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* スキャンステップ */}
        {step === "scan" && (
          <div className="flex w-full flex-col items-center gap-6">
            {!selectedEventId && (
              <p className="text-yellow-400">イベントを読み込み中...</p>
            )}
            {selectedEventId && mode === "camera" && (
              <QrScanner onScanSuccess={handleScanSuccess} autoStart />
            )}
            {selectedEventId && mode === "usb" && (
              <div className="flex w-full max-w-md flex-col items-center gap-4 py-12">
                <div className="text-6xl">📷</div>
                <p className="text-center text-lg text-white">
                  USB QR リーダーでプレイヤーの QR コードをスキャンしてください
                </p>
              </div>
            )}
            {isLoading && (
              <p className="text-white">プレイヤー情報を確認中...</p>
            )}
          </div>
        )}

        {/* スタック入力ステップ */}
        {step === "stackInput" && pendingPlayer && (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-3">
              {pendingPlayer.avatarUrl && (
                <img
                  alt={pendingPlayer.nickName}
                  className="h-20 w-20 rounded-full object-cover"
                  src={pendingPlayer.avatarUrl}
                />
              )}
              <p className="font-bold text-2xl text-primary">
                {pendingPlayer.nickName}
              </p>
            </div>
            <div className="flex w-full max-w-sm flex-col gap-3">
              <label
                className="font-bold text-sm text-white"
                htmlFor="stack-input"
              >
                スタック額
              </label>
              <input
                className="h-16 w-full rounded-full border border-black bg-black-darkest px-8 font-bold text-lg text-white placeholder:text-gray-700"
                id="stack-input"
                min={1}
                placeholder="例: 10000"
                type="number"
                value={stackInput}
                onChange={(e) => setStackInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleStackSubmit();
                }}
              />
            </div>
            <div className="flex gap-4">
              <RoundButton
                disabled={isLoading}
                size="medium"
                text="キャンセル"
                type="black"
                onClick={handleCancel}
              />
              <RoundButton
                disabled={isLoading || !stackInput}
                size="medium"
                text={isLoading ? "処理中..." : "チェックイン"}
                type="primary"
                onClick={handleStackSubmit}
              />
            </div>
          </div>
        )}

        {/* 完了ステップ */}
        {step === "complete" && pendingPlayer && (
          <div className="flex w-full flex-col items-center gap-6 py-12">
            <div className="text-6xl">✅</div>
            <p className="font-bold text-2xl text-primary">チェックイン完了</p>
            <p className="text-white">{pendingPlayer.nickName}</p>
            <p className="text-gray-400 text-sm">
              次のプレイヤーのスキャンに自動的に戻ります...
            </p>
          </div>
        )}
      </div>
    </BasicPage>
  );
}
