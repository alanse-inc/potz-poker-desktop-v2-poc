import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { api } from "../../../../api/client";
import { useAutoBoard } from "../../../../contexts/auto_board_context";
import { useTelop } from "../../../../contexts/telop_context";
import type { AutoModeBoard } from "../../../../domain/auto_game/types";
import { trackClientSideError } from "../../../../features/error_tracker";
import {
  executeFold,
  executeUnfold,
} from "../../../../workflow/auto_game/fold";
import { moveNextGame } from "../../../../workflow/auto_game/move_next_game";

type FoldOperation = {
  playerId: string;
  type: "fold" | "unfold";
};

const CLICK_DELAY = 300;

export function useGameActions() {
  const { board, setBoard, resetBoard } = useAutoBoard();
  const navigate = useNavigate();
  const { isOpen, setIsOpen } = useTelop();
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  const [optimisticBoard, setOptimisticBoard] = useState<AutoModeBoard | null>(
    null,
  );
  const optimisticBoardRef = useRef<AutoModeBoard | null>(null);
  const clickTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const foldQueueRef = useRef<Array<FoldOperation>>([]);
  const isProcessingRef = useRef(false);

  const processFoldQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (foldQueueRef.current.length === 0) return;

    isProcessingRef.current = true;
    let currentBoard: AutoModeBoard | undefined =
      optimisticBoardRef.current ?? board ?? undefined;

    try {
      while (foldQueueRef.current.length > 0) {
        const operation = foldQueueRef.current.shift();
        if (!operation || !currentBoard) break;

        const result =
          operation.type === "fold"
            ? executeFold(currentBoard, operation.playerId)
            : executeUnfold(currentBoard, operation.playerId);

        if (result.ok) {
          currentBoard = result.board;
          setBoard(result.board);
        } else {
          toast.error(result.error);
        }
      }
    } finally {
      isProcessingRef.current = false;
      optimisticBoardRef.current = currentBoard ?? null;
      setOptimisticBoard(null);
    }
  }, [board, setBoard]);

  const handleFold = useCallback(
    (playerId: string) => {
      const baseBoard = optimisticBoardRef.current ?? board;
      if (!baseBoard) return;

      const result = executeFold(baseBoard, playerId);
      if (!result.ok) return;

      optimisticBoardRef.current = result.board;
      setOptimisticBoard(result.board);

      foldQueueRef.current.push({ playerId, type: "fold" });
      processFoldQueue();
    },
    [board, processFoldQueue],
  );

  const handleUnfold = useCallback(
    (playerId: string) => {
      const baseBoard = optimisticBoardRef.current ?? board;
      if (!baseBoard) return;

      const result = executeUnfold(baseBoard, playerId);
      if (!result.ok) return;

      optimisticBoardRef.current = result.board;
      setOptimisticBoard(result.board);

      foldQueueRef.current.push({ playerId, type: "unfold" });
      processFoldQueue();
    },
    [board, processFoldQueue],
  );

  const handlePlayerCardPress = useCallback(
    (playerId: string) => {
      const timerMap = clickTimerRef.current;
      const existingTimer = timerMap.get(playerId);

      if (existingTimer !== undefined) {
        clearTimeout(existingTimer);
        timerMap.delete(playerId);
        handleUnfold(playerId);
        return;
      }

      const timer = setTimeout(() => {
        timerMap.delete(playerId);
        handleFold(playerId);
      }, CLICK_DELAY);

      timerMap.set(playerId, timer);
    },
    [handleFold, handleUnfold],
  );

  const handleNextGame = useCallback(() => {
    const currentBoard = optimisticBoard ?? board;
    if (!currentBoard) {
      toast.error("ボードが初期化されていません");
      return;
    }

    const result = moveNextGame(currentBoard);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const nextInitial = result.board;
    const nextBoard: AutoModeBoard = {
      setting: nextInitial.setting,
      players: nextInitial.players,
      communityCards: [],
      burnCards: [],
      handNumber: nextInitial.handNumber,
      winners: null,
    };

    setBoard(nextBoard);
    optimisticBoardRef.current = nextBoard;
    setOptimisticBoard(null);
  }, [board, optimisticBoard, setBoard]);

  const handleCaptionWindowToggle = useCallback(async () => {
    try {
      if (isOpen) {
        await api.telop.close();
        setIsOpen(false);
      } else {
        await api.telop.open();
        setIsOpen(true);
      }
    } catch (error) {
      trackClientSideError(
        "[AutoGamePlaying] Failed to toggle caption window",
        { cause: error },
      );
      toast.error("テロップウィンドウの操作に失敗しました");
    }
  }, [isOpen, setIsOpen]);

  const handleChangeGameMode = useCallback(() => {
    navigate("/game/first-game/setting");
  }, [navigate]);

  const handleBack = useCallback(() => {
    navigate("/auto-game/setting");
  }, [navigate]);

  const handleOpenExitModal = useCallback(() => {
    setIsExitModalOpen(true);
  }, []);

  const handleCloseExitModal = useCallback(() => {
    setIsExitModalOpen(false);
  }, []);

  const handleExitToEdit = useCallback(() => {
    setIsExitModalOpen(false);
    resetBoard();
    navigate("/auto-game/setting");
  }, [navigate, resetBoard]);

  return {
    optimisticBoard,
    isTelopOpen: isOpen,
    isExitModalOpen,
    onPlayerCardPress: handlePlayerCardPress,
    onNextGame: handleNextGame,
    onCaptionWindowToggle: handleCaptionWindowToggle,
    onChangeGameMode: handleChangeGameMode,
    onBack: handleBack,
    onOpenExitModal: handleOpenExitModal,
    onCloseExitModal: handleCloseExitModal,
    onExitToEdit: handleExitToEdit,
  };
}
