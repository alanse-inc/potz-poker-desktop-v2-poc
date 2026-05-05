import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { createHand } from "../../../api/backend_hands";
import { api } from "../../../api/client";
import { fetchHandContext } from "../../../api/hand_context_api";
import { mapShowdownBoardToCreateHandRequest } from "../../../api/mappers/board_to_hand_request";
import { useAuth } from "../../../contexts/auth_context";
import { useBoard } from "../../../contexts/board_context";
import { useOperator } from "../../../contexts/operator_context";
import { useSession } from "../../../contexts/session_context";
import { trackClientSideError } from "../../../features/error_tracker";
import { PlayerEditModal } from "../../../features/modal/player_edit_modal";
import {
  type VoiceCommandLogEntry,
  VoiceInputIndicator,
} from "../../../features/voice_input_indicator";
import { voiceInputService } from "../../../services/voice_input_service";
import type { GameSettings, TexasHoldemBoard } from "../../../types";
import type { ActionType } from "./components/action_buttons";
import { AddPlayerModal } from "./components/add_player_modal";
import { BetAmountModal } from "./components/bet_amount_modal";
import { EditCommunityCardModal } from "./components/edit_community_card_modal";
import { SelectExposeCardModal } from "./components/select_expose_card_modal";
import { useVoiceCommandQueue } from "./hooks/use_voice_command_queue";
import { useActionProps } from "./hooks/useActionProps";
import { useCardPlacedHandler } from "./hooks/useCardPlacedHandler";
import { type ActionConfirmType, Page } from "./page";

const ALL_DISABLED: ActionType[] = [
  "call",
  "check",
  "fold",
  "bet",
  "raise",
  "allin",
];

function computeDisabledActions(board: TexasHoldemBoard): ActionType[] {
  if (board.phase === "showdown") return [...ALL_DISABLED];

  const me = board.players.find((p) => p.position === board.currentTurn);
  if (!me || me.hasFolded || me.isAllIn) return [...ALL_DISABLED];

  // スタック 0 のプレイヤーは何もアクションできない（BET/RAISE/CALL/ALL-IN は不可）
  if (me.stack === 0) return [...ALL_DISABLED];

  const disabled: ActionType[] = [];

  if (board.currentBet > me.betInRound) {
    disabled.push("check");
  } else {
    disabled.push("call");
  }

  if (board.currentBet > 0) {
    disabled.push("bet");
  } else {
    disabled.push("raise");
  }

  return disabled;
}

function reportError(e: unknown, fallback: string) {
  const message =
    e instanceof Error ? e.message : typeof e === "string" ? e : fallback;
  toast.error(message);
}

export function GamePlaying() {
  const { board, refresh } = useBoard();
  const navigate = useNavigate();
  const { currentSession, currentGameSessionId } = useSession();
  const { gameTable } = useOperator();
  const { getAccessToken } = useAuth();

  // RFID カード配置イベントを処理
  useCardPlacedHandler();
  const [isOpenResetConfirm, setIsOpenResetConfirm] = useState(false);
  const [confirmType, setConfirmType] = useState<ActionConfirmType | null>(
    null,
  );
  const [editLocateNumber, setEditLocateNumber] = useState<number | null>(null);
  const [editPlayerPosition, setEditPlayerPosition] = useState<number | null>(
    null,
  );
  const [isOpenAddPlayer, setIsOpenAddPlayer] = useState(false);
  const [isOpenExpose, setIsOpenExpose] = useState(false);
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null);
  const [commandLog, setCommandLog] = useState<VoiceCommandLogEntry[]>([]);

  const boardRef = useRef<TexasHoldemBoard | null>(board);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  // BET/RAISE 計算で使用するため永続化されたブラインド設定を取得
  useEffect(() => {
    api.gameSettings
      .load()
      .then(setGameSettings)
      .catch(() => {
        setGameSettings(null);
      });
  }, []);

  const handleCommandLogged = useCallback((entry: VoiceCommandLogEntry) => {
    setCommandLog((prev) => [entry, ...prev].slice(0, 20));
  }, []);

  const handleBackAction = useCallback(async () => {
    try {
      await api.board.backBoard();
      await refresh();
    } catch (e) {
      reportError(e, "BACK に失敗しました");
    }
  }, [refresh]);

  const handleEditGame = useCallback(async () => {
    try {
      await api.board.moveNextGame();
      await refresh();
    } catch (e) {
      reportError(e, "ゲーム進行に失敗しました");
    }
  }, [refresh]);

  const { enqueue } = useVoiceCommandQueue(
    boardRef,
    handleBackAction,
    handleEditGame,
    handleCommandLogged,
  );

  useEffect(() => {
    if (!voiceInputService.enabled) return;
    return voiceInputService.onCommand(enqueue);
  }, [enqueue]);

  const actionProps = useActionProps(board, handleCommandLogged, refresh);

  const handleNextGame = useCallback(async () => {
    if (
      board?.phase === "showdown" &&
      currentSession &&
      currentGameSessionId &&
      gameTable &&
      gameSettings
    ) {
      try {
        const handContextResult = await fetchHandContext();
        if (handContextResult.isErr()) {
          trackClientSideError(
            `[GamePlaying] fetchHandContext failed: ${handContextResult.error.message}`,
          );
        } else {
          const endTime = new Date().toISOString();
          const requestResult = await mapShowdownBoardToCreateHandRequest(
            board,
            currentGameSessionId,
            currentSession.gameEventId,
            gameTable.tableId,
            "ring_game",
            handContextResult.value,
            gameSettings,
            endTime,
          );
          if (requestResult.isErr()) {
            trackClientSideError(
              `[GamePlaying] Hand request mapping failed: ${requestResult.error.message}`,
            );
          } else {
            const apiResult = await createHand(
              requestResult.value,
              getAccessToken,
            );
            if (!apiResult.ok) {
              trackClientSideError(
                `[GamePlaying] Hand submission failed: ${apiResult.message} (${apiResult.status})`,
              );
            }
          }
        }
      } catch (error) {
        trackClientSideError("[GamePlaying] Hand submission error", {
          cause: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
    navigate("/game/next-game");
  }, [
    navigate,
    board,
    currentSession,
    currentGameSessionId,
    gameTable,
    gameSettings,
    getAccessToken,
  ]);

  const handleResetConfirm = useCallback(async () => {
    try {
      await api.board.resetBoard();
      setIsOpenResetConfirm(false);
      navigate("/game/setting");
    } catch (e) {
      setIsOpenResetConfirm(false);
      reportError(e, "リセットに失敗しました");
    }
  }, [navigate]);

  const handlePlayerCardPress = useCallback((position: number) => {
    setEditPlayerPosition(position);
  }, []);

  const handlePlayerEdited = useCallback(async () => {
    try {
      await refresh();
    } catch (e) {
      reportError(e, "ボードの更新に失敗しました");
    }
  }, [refresh]);

  const handleEditCommunityCard = useCallback((locateNumber: number) => {
    setEditLocateNumber(locateNumber);
  }, []);

  const handleEditCommunityCardConfirmed = useCallback(async () => {
    setEditLocateNumber(null);
    try {
      await refresh();
    } catch (e) {
      reportError(e, "ボードの更新に失敗しました");
    }
  }, [refresh]);

  const handleExposeConfirmed = useCallback(async () => {
    setIsOpenExpose(false);
    try {
      await refresh();
    } catch (e) {
      reportError(e, "ボードの更新に失敗しました");
    }
  }, [refresh]);

  const resetConfirmProps = useMemo(
    () => ({
      isOpen: isOpenResetConfirm,
      onOpenClick: () => setIsOpenResetConfirm(true),
      onConfirmClick: handleResetConfirm,
      onCloseClick: () => setIsOpenResetConfirm(false),
    }),
    [isOpenResetConfirm, handleResetConfirm],
  );

  const disabledActionTypes: ActionType[] = useMemo(() => {
    if (!board) return ALL_DISABLED;
    return computeDisabledActions(board);
  }, [board]);

  const me = useMemo(
    () => board?.players.find((p) => p.position === board.currentTurn),
    [board],
  );

  const bigBlindAmount = useMemo(() => {
    if (gameSettings?.bigBlind) return gameSettings.bigBlind;
    // フォールバック: BBポジションの betInRound (preflop のみ有効)
    if (board?.players[board.bbPosition]?.betInRound) {
      return board.players[board.bbPosition].betInRound;
    }
    return board?.currentBet ?? 0;
  }, [gameSettings, board]);

  const minRaise = useMemo(() => {
    if (!board) return 0;
    // 最低レイズ額 = currentBet + bigBlind（標準的なポーカーの最低レイズ額）
    return board.currentBet + bigBlindAmount;
  }, [board, bigBlindAmount]);

  const minBet = useMemo(() => {
    return Math.max(bigBlindAmount, 1);
  }, [bigBlindAmount]);

  const handleConfirmAmount = useCallback(
    async (amount: number) => {
      if (!confirmType) return;
      const type = confirmType;
      setConfirmType(null);
      if (type === "BET") {
        await actionProps.onBet(amount);
      } else {
        await actionProps.onRaise(amount);
      }
    },
    [actionProps, confirmType],
  );

  const isShowdown = board?.phase === "showdown";

  // Expose ボタンの disabled ロジック: preflop かつコミュニティカードが 0 枚のときのみ有効
  const isExposeDisabled = useMemo(() => {
    if (!board) return true;
    return board.phase !== "pre_flop" || board.communityCards.length > 0;
  }, [board]);

  const winnerText = useMemo(() => {
    if (!board || board.phase !== "showdown" || board.winners.length === 0) {
      return undefined;
    }
    const names = board.winners
      .map((pos) => board.players.find((p) => p.position === pos)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length === 0) return undefined;
    return `Winner: ${names.join(", ")}`;
  }, [board]);

  const clickableLocateNumbers = useMemo(() => {
    if (!board || board.phase === "showdown") return [];
    const next = board.communityCards.length;
    if (next < 5) return [next];
    return [];
  }, [board]);

  if (!board) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black-deep">
        <p className="font-bold text-white">ゲームが開始されていません</p>
      </div>
    );
  }

  const editTargetPlayer =
    editPlayerPosition !== null
      ? board.players.find((p) => p.position === editPlayerPosition)
      : undefined;

  return (
    <>
      <Page
        board={board}
        disabledActionTypes={disabledActionTypes}
        actionProps={actionProps}
        resetConfirmProps={resetConfirmProps}
        onPlayerCardPress={handlePlayerCardPress}
        onBackAction={handleBackAction}
        onNextGame={handleNextGame}
        isNextGameDisabled={false}
        isShowdown={isShowdown}
        centerText={winnerText}
        onRequestBet={() => setConfirmType("BET")}
        onRequestRaise={() => setConfirmType("RAISE")}
        clickableLocateNumbers={clickableLocateNumbers}
        onEditCommunityCard={handleEditCommunityCard}
        onAddPlayer={() => setIsOpenAddPlayer(true)}
        isAddPlayerDisabled={!isShowdown || board.players.length >= 9}
        onExpose={() => setIsOpenExpose(true)}
        isExposeDisabled={isExposeDisabled}
      />
      <VoiceInputIndicator commandLog={commandLog} />
      {confirmType && me && me.stack > 0 && (
        <BetAmountModal
          type={confirmType}
          minAmount={confirmType === "BET" ? minBet : minRaise}
          maxAmount={me.stack + me.betInRound}
          bigBlind={bigBlindAmount}
          onCancel={() => setConfirmType(null)}
          onConfirm={handleConfirmAmount}
        />
      )}
      {editLocateNumber !== null && (
        <EditCommunityCardModal
          locateNumber={editLocateNumber}
          onClose={() => setEditLocateNumber(null)}
          onConfirmed={handleEditCommunityCardConfirmed}
        />
      )}
      {editTargetPlayer && (
        <PlayerEditModal
          player={editTargetPlayer}
          isShowdown={isShowdown}
          canRemove={board.players.length > 2}
          onClose={() => setEditPlayerPosition(null)}
          onUpdated={handlePlayerEdited}
        />
      )}
      {isOpenAddPlayer && (
        <AddPlayerModal
          defaultName={`Player${board.players.length + 1}`}
          onClose={() => setIsOpenAddPlayer(false)}
          onAdded={handlePlayerEdited}
        />
      )}
      {isOpenExpose && (
        <SelectExposeCardModal
          onClose={() => setIsOpenExpose(false)}
          onConfirmed={handleExposeConfirmed}
        />
      )}
    </>
  );
}
