import type { Html5QrcodeResult } from "html5-qrcode";
import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useLocation } from "react-router";
import { BackendApiError, checkinPlayer, getPlayer } from "../../api/backend";
import {
  type PlayerSeatRange,
  useInitializeBoardCommand,
} from "../../contexts/initialize_board_command_context";
import { useSession } from "../../contexts/session_context";
import { useSyncedNavigate } from "../../hooks/useSyncedNavigate";
import { RoundButton } from "../../ui/button/round_button";
import { BasicPage } from "../../ui/page/basic";
import { Switch } from "../../ui/switch";
import { CheckInBoard } from "./components/check_in_board";
import { QrScanner } from "./components/qr_scanner";
import { StackInputModal } from "./components/stack_input_modal";
import { extractPlayerId } from "./extract_player_id";
import { useUsbQrReader } from "./hooks/useUsbQrReader";

type CheckInStep = "scanning" | "stack_input" | "seat_selection";

type CheckInData = {
  playerId: string;
  playerName?: string;
  playerIcon?: string | null;
  stack?: number;
};

export function CheckIn() {
  const navigate = useSyncedNavigate();
  const location = useLocation();
  const { currentSession, currentGameSessionId } = useSession();
  const { initializeBoardCommand, updatePlayer } = useInitializeBoardCommand();

  const source =
    (location.state as { source?: string } | null)?.source ?? "first_game";
  const isNextGame = source === "next_game";

  const players = initializeBoardCommand.input.players;

  const [currentStep, setCurrentStep] = useState<CheckInStep>("scanning");
  const [checkInData, setCheckInData] = useState<CheckInData | null>(null);
  const [stackValue, setStackValue] = useState<number>(0);
  const [loadingSeat, setLoadingSeat] = useState<PlayerSeatRange | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraMode, setIsCameraMode] = useState(false);
  const isProcessingScanRef = useRef(false);

  const processQrCode = useCallback(
    async (decodedText: string) => {
      if (isProcessingScanRef.current) return;

      isProcessingScanRef.current = true;
      setIsLoading(true);

      try {
        const playerId = extractPlayerId(decodedText);
        if (!playerId) {
          toast.error("無効な QR コードです");
          return;
        }

        const alreadyCheckedIn = players.some(
          (p) => p.id === playerId && p.status === "active",
        );
        if (alreadyCheckedIn) {
          toast.error("このプレイヤーはすでにチェックイン済みです");
          return;
        }

        const playerData = await getPlayer(playerId);

        setCheckInData({
          playerId,
          playerName: playerData.nickName,
          playerIcon: playerData.avatarUrlSmall,
        });
        setStackValue(0);
        setCurrentStep("stack_input");
        isProcessingScanRef.current = false;
      } catch (err) {
        const message =
          err instanceof BackendApiError && err.status === 404
            ? "プレイヤーが見つかりません"
            : err instanceof Error
              ? err.message
              : "プレイヤー情報の取得に失敗しました";
        toast.error(message);
        setTimeout(() => {
          isProcessingScanRef.current = false;
        }, 1000);
      } finally {
        setIsLoading(false);
      }
    },
    [players],
  );

  const handleScanSuccess = useCallback(
    (decodedText: string, _result: Html5QrcodeResult) =>
      processQrCode(decodedText),
    [processQrCode],
  );

  const handleUsbInput = useCallback(
    (decodedText: string) => processQrCode(decodedText),
    [processQrCode],
  );

  useUsbQrReader(handleUsbInput, !isCameraMode && currentStep === "scanning");

  const handleStackChange = useCallback((value: number) => {
    setStackValue(value);
  }, []);

  const handleStackSubmit = useCallback(() => {
    if (stackValue === 0) return;
    setCheckInData((prev) => {
      if (!prev) return prev;
      return { ...prev, stack: stackValue };
    });
    setCurrentStep("seat_selection");
  }, [stackValue]);

  const handleStackCancel = useCallback(() => {
    setCheckInData(null);
    setStackValue(0);
    setCurrentStep("scanning");
  }, []);

  const handleSelectSeat = useCallback(
    async (seat: PlayerSeatRange) => {
      if (!checkInData || !checkInData.stack) return;

      setLoadingSeat(seat);
      setIsLoading(true);

      try {
        if (!currentSession) {
          throw new Error("セッションが選択されていません");
        }
        if (!currentGameSessionId) {
          toast.error("ゲームセッションIDが設定されていません");
          return;
        }

        await checkinPlayer({
          gameEventId: currentSession.gameEventId,
          gameSessionId: currentGameSessionId,
          playerId: checkInData.playerId,
        });

        updatePlayer({
          id: checkInData.playerId,
          name: checkInData.playerName ?? "",
          icon: checkInData.playerIcon ?? undefined,
          status: "active",
          stack: checkInData.stack,
          position: null,
          seat,
        });

        toast.success("チェックインが完了しました");

        const targetRoute = isNextGame
          ? "/game/next-game/setting"
          : "/game/first-game/setting";
        navigate(targetRoute);
      } catch (err) {
        if (err instanceof BackendApiError && err.status === 422) {
          toast.error("このプレイヤーはすでにチェックイン済みです");
          setCheckInData(null);
          setStackValue(0);
          setCurrentStep("scanning");
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : "チェックインの作成に失敗しました";
        toast.error(message);
      } finally {
        setIsLoading(false);
        setLoadingSeat(null);
      }
    },
    [
      checkInData,
      navigate,
      currentSession,
      currentGameSessionId,
      updatePlayer,
      isNextGame,
    ],
  );

  const handleBack = useCallback(() => {
    const targetRoute = isNextGame
      ? "/game/next-game/setting"
      : "/game/first-game/setting";
    navigate(targetRoute);
  }, [navigate, isNextGame]);

  return (
    <BasicPage>
      <div className="flex h-full w-full flex-col items-center justify-between gap-8 p-8">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-4">
            {currentStep === "scanning" && (
              <Switch
                text="カメラモード"
                checked={isCameraMode}
                disabled={isLoading}
                onChange={setIsCameraMode}
              />
            )}
          </div>
          <RoundButton
            type="black"
            text="BACK"
            size="auto"
            onClick={handleBack}
          />
        </div>

        <div className="flex w-full flex-1 items-center justify-center">
          {currentStep === "scanning" && (
            <div className="-mt-16 flex w-full max-w-2xl flex-col items-center gap-6">
              {isCameraMode && (
                <QrScanner onScanSuccess={handleScanSuccess} autoStart />
              )}
              {!isCameraMode && (
                <div className="flex w-full max-w-md flex-col items-center gap-4 py-12">
                  <div className="text-6xl">📷</div>
                  <p className="text-center text-lg text-white">
                    USB QRリーダーでプレイヤーのQRコードをスキャンしてください
                  </p>
                </div>
              )}
              {isLoading && (
                <div className="text-lg text-white">
                  チェックイン情報を確認中...
                </div>
              )}
            </div>
          )}

          {currentStep === "stack_input" && (
            <StackInputModal
              playerName={checkInData?.playerName}
              playerIcon={checkInData?.playerIcon}
              value={stackValue}
              onChange={handleStackChange}
              onSubmit={handleStackSubmit}
              onCancel={handleStackCancel}
            />
          )}

          {currentStep === "seat_selection" && (
            <div className="flex w-full flex-col items-center gap-6">
              {isLoading && (
                <div className="text-lg text-white">チェックイン処理中...</div>
              )}
              <CheckInBoard
                players={players}
                loadingSeat={loadingSeat}
                onSelectSeat={handleSelectSeat}
              />
            </div>
          )}
        </div>
      </div>
    </BasicPage>
  );
}
