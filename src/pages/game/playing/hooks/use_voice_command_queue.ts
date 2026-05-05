import { useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { api } from "../../../../api/client";
import {
  trackClientSideError,
  trackError,
} from "../../../../features/error_tracker";
import type { VoiceCommandLogEntry } from "../../../../features/voice_input_indicator";
import { voiceInputService } from "../../../../services/voice_input_service";
import type { TexasHoldemBoard } from "../../../../types";
import type { VoicePokerCommand } from "../../../../types/voice_input";

const MAX_AUTO_SKIP_ITERATIONS = 10;
const ACTIONABLE_WAIT_TIMEOUT_MS = 3000;
const ACTIONABLE_POLL_INTERVAL_MS = 100;
const POST_ACTION_SETTLE_MS = 200;

const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const warnVoiceAction = (message: string): void => {
  voiceInputService.emitStatusPublic("listening", message);
  toast.error(message);
};

type HandlerResult = boolean;
const CONTINUE_QUEUE: HandlerResult = true;
const BREAK_QUEUE: HandlerResult = false;

function isActionableBoard(board: TexasHoldemBoard): boolean {
  return board.phase !== "showdown";
}

function canChangeRound(board: TexasHoldemBoard): boolean {
  const activePlayers = board.players.filter((p) => !p.hasFolded && !p.isAllIn);
  if (activePlayers.length === 0) return true;
  const maxBet = Math.max(...board.players.map((p) => p.betInRound), 0);
  return activePlayers.every((p) => p.hasActed && p.betInRound === maxBet);
}

function canCheck(board: TexasHoldemBoard): boolean {
  const current = board.players.find((p) => p.position === board.currentTurn);
  if (!current) return false;
  return current.betInRound >= board.currentBet;
}

function classifyBetOrRaise(board: TexasHoldemBoard): "bet" | "raise" {
  return board.currentBet > 0 ? "raise" : "bet";
}

function isEvaluatable(player: TexasHoldemBoard["players"][number]): boolean {
  return !player.hasFolded && !player.isAllIn;
}

export function useVoiceCommandQueue(
  boardRef: React.RefObject<TexasHoldemBoard | null>,
  onBack: () => Promise<void>,
  onEditGame: () => Promise<void>,
  onActionExecuted?: (entry: VoiceCommandLogEntry) => void,
) {
  const queueRef = useRef<VoicePokerCommand[]>([]);
  const isProcessingRef = useRef(false);
  const activeIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const unmountedRef = useRef(false);

  const waitForBoardUpdate = useCallback(
    (prevBoard: TexasHoldemBoard): Promise<boolean> => {
      if (unmountedRef.current) return Promise.resolve(false);
      const prevHandNumber = prevBoard.handNumber;
      const prevPhase = prevBoard.phase;
      return new Promise((resolve) => {
        let elapsed = 0;
        const interval = setInterval(() => {
          if (unmountedRef.current) {
            clearInterval(interval);
            activeIntervalsRef.current = activeIntervalsRef.current.filter(
              (id) => id !== interval,
            );
            resolve(false);
            return;
          }
          elapsed += 100;
          const current = boardRef.current;
          if (
            current &&
            (current.handNumber !== prevHandNumber ||
              current.phase !== prevPhase)
          ) {
            clearInterval(interval);
            activeIntervalsRef.current = activeIntervalsRef.current.filter(
              (id) => id !== interval,
            );
            resolve(true);
          } else if (elapsed >= 2000) {
            clearInterval(interval);
            activeIntervalsRef.current = activeIntervalsRef.current.filter(
              (id) => id !== interval,
            );
            resolve(false);
          }
        }, 100);
        activeIntervalsRef.current.push(interval);
      });
    },
    [boardRef],
  );

  const waitForActionableBoard =
    useCallback((): Promise<TexasHoldemBoard | null> => {
      if (unmountedRef.current) return Promise.resolve(null);
      return new Promise((resolve) => {
        let elapsed = 0;
        const interval = setInterval(() => {
          if (unmountedRef.current) {
            clearInterval(interval);
            activeIntervalsRef.current = activeIntervalsRef.current.filter(
              (id) => id !== interval,
            );
            resolve(null);
            return;
          }
          elapsed += ACTIONABLE_POLL_INTERVAL_MS;
          const current = boardRef.current;
          if (current && isActionableBoard(current)) {
            clearInterval(interval);
            activeIntervalsRef.current = activeIntervalsRef.current.filter(
              (id) => id !== interval,
            );
            resolve(current);
          } else if (elapsed >= ACTIONABLE_WAIT_TIMEOUT_MS) {
            clearInterval(interval);
            activeIntervalsRef.current = activeIntervalsRef.current.filter(
              (id) => id !== interval,
            );
            resolve(null);
          }
        }, ACTIONABLE_POLL_INTERVAL_MS);
        activeIntervalsRef.current.push(interval);
      });
    }, [boardRef]);

  const executeAction = useCallback(
    async (
      command: VoicePokerCommand,
      _board: TexasHoldemBoard,
    ): Promise<boolean> => {
      switch (command.action) {
        case "call": {
          try {
            await api.action.call();
            return true;
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            toast.error(`${command.action} の実行に失敗しました`);
            return false;
          }
        }
        case "check": {
          try {
            await api.action.check();
            return true;
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            toast.error(`${command.action} の実行に失敗しました`);
            return false;
          }
        }
        case "fold": {
          try {
            await api.action.fold();
            return true;
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            toast.error(`${command.action} の実行に失敗しました`);
            return false;
          }
        }
        case "all-in": {
          try {
            await api.action.allin();
            return true;
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            toast.error(`${command.action} の実行に失敗しました`);
            return false;
          }
        }
        case "bet": {
          if (command.amount === null) {
            warnVoiceAction("BET 額が取得できませんでした");
            return false;
          }
          try {
            await api.action.bet(command.amount);
            return true;
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            toast.error(`${command.action} の実行に失敗しました`);
            return false;
          }
        }
        case "raise": {
          if (command.amount === null) {
            warnVoiceAction("RAISE 額が取得できませんでした");
            return false;
          }
          try {
            await api.action.raise(command.amount);
            return true;
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            toast.error(`${command.action} の実行に失敗しました`);
            return false;
          }
        }
        case "expose":
        case "back":
        case "ok":
          return false;
        default:
          return false;
      }
    },
    [],
  );

  const autoBackUntilSeat = useCallback(
    async (targetSeat: number): Promise<void> => {
      let iterations = 0;

      while (iterations < MAX_AUTO_SKIP_ITERATIONS) {
        const currentBoard = boardRef.current;
        if (!currentBoard) return;

        const currentPlayer = currentBoard.players.find(
          (p) => p.position === currentBoard.currentTurn,
        );
        if (!currentPlayer) {
          trackClientSideError(
            "[VoiceCommandQueue] autoBackUntilSeat: currentTurnに一致するプレイヤーが見つからない",
            { context: { targetSeat } },
          );
          return;
        }
        if (currentPlayer.position === targetSeat) {
          return;
        }

        await onBack();
        const updated = await waitForBoardUpdate(currentBoard);
        if (!updated) {
          trackClientSideError(
            "[VoiceCommandQueue] autoBackUntilSeat: ボード更新待機がタイムアウト",
            { context: { targetSeat, iteration: iterations } },
          );
          return;
        }
        await sleep(POST_ACTION_SETTLE_MS);
        iterations++;
      }

      trackClientSideError(
        "[VoiceCommandQueue] autoBackUntilSeat: ループ上限に到達",
        { context: { targetSeat, iterations } },
      );
    },
    [boardRef, onBack, waitForBoardUpdate],
  );

  const autoFoldUntilSeat = useCallback(
    async (targetSeat: number): Promise<TexasHoldemBoard | null> => {
      let iterations = 0;

      while (iterations < MAX_AUTO_SKIP_ITERATIONS) {
        const latestBoard = await waitForActionableBoard();
        if (!latestBoard) {
          trackClientSideError(
            "[VoiceCommandQueue] autoFoldUntilSeat: Actionable ボード待機がタイムアウト",
            {
              context: {
                targetSeat,
                iteration: iterations,
                currentPhase: boardRef.current?.phase ?? null,
              },
            },
          );
          return null;
        }

        const currentPlayer = latestBoard.players.find(
          (p) => p.position === latestBoard.currentTurn,
        );
        if (!currentPlayer) {
          trackClientSideError(
            "[VoiceCommandQueue] currentTurnに一致するプレイヤーが見つからない",
            {
              context: {
                currentTurn: latestBoard.currentTurn,
                targetSeat,
              },
            },
          );
          return null;
        }
        if (currentPlayer.position === targetSeat) {
          return latestBoard;
        }

        if (canChangeRound(latestBoard)) {
          trackClientSideError(
            "[VoiceCommandQueue] autoFoldUntilSeat: ラウンド遷移待機中にシート指定コマンドを受信。処理を中断",
            {
              context: {
                targetSeat,
                currentTurn: latestBoard.currentTurn,
                phase: latestBoard.phase,
              },
            },
          );
          return null;
        }

        if (!canCheck(latestBoard)) {
          try {
            await api.action.fold();
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            return null;
          }
        } else {
          try {
            await api.action.check();
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            return null;
          }
        }

        const updated = await waitForBoardUpdate(latestBoard);
        if (!updated) {
          trackClientSideError(
            "[VoiceCommandQueue] 自動FOLDのボード更新待機がタイムアウト",
            { context: { targetSeat, iteration: iterations } },
          );
          return null;
        }
        await sleep(POST_ACTION_SETTLE_MS);
        iterations++;
      }

      trackClientSideError("[VoiceCommandQueue] 自動FOLDがループ上限に到達", {
        context: { targetSeat, iterations },
      });
      return null;
    },
    [boardRef, waitForBoardUpdate, waitForActionableBoard],
  );

  const autoCheckAround = useCallback(async (): Promise<void> => {
    let iterations = 0;

    while (iterations < MAX_AUTO_SKIP_ITERATIONS) {
      const latestBoard = await waitForActionableBoard();
      if (!latestBoard) {
        trackClientSideError(
          "[VoiceCommandQueue] autoCheckAround: Actionable ボード待機がタイムアウト",
          {
            context: {
              iteration: iterations,
              currentPhase: boardRef.current?.phase ?? null,
            },
          },
        );
        return;
      }

      if (canChangeRound(latestBoard)) {
        return;
      }

      const activeCount = latestBoard.players.filter(isEvaluatable).length;
      if (activeCount <= 1) {
        return;
      }

      const currentPlayer = latestBoard.players.find(
        (p) => p.position === latestBoard.currentTurn,
      );
      if (!currentPlayer) {
        trackClientSideError(
          "[VoiceCommandQueue] autoCheckAround: currentTurnに一致するプレイヤーが見つからない",
          { context: { currentTurn: latestBoard.currentTurn } },
        );
        return;
      }

      if (!canCheck(latestBoard)) {
        trackClientSideError(
          "[VoiceCommandQueue] autoCheckAround: 入口で先行 bet 無しを確認したのにループ内で check 不可になった",
          {
            context: {
              iteration: iterations,
              currentTurn: latestBoard.currentTurn,
              phase: latestBoard.phase,
            },
          },
        );
        warnVoiceAction(
          "チェックアラウンドの実行中に状態が変化したため中断しました",
        );
        return;
      }

      try {
        await api.action.check();
      } catch (e) {
        trackError({ type: "game_action_error", message: String(e) });
        toast.error("チェックアラウンドの実行に失敗しました");
        return;
      }

      onActionExecuted?.({
        action: "check",
        amount: null,
        seatNumber: currentPlayer.position,
        timestamp: Date.now(),
      });

      const updated = await waitForBoardUpdate(latestBoard);
      if (!updated) {
        trackClientSideError(
          "[VoiceCommandQueue] autoCheckAround: ボード更新待機がタイムアウト",
          { context: { iteration: iterations } },
        );
        return;
      }
      await sleep(POST_ACTION_SETTLE_MS);
      iterations++;
    }

    trackClientSideError(
      "[VoiceCommandQueue] autoCheckAround: ループ上限に到達",
      { context: { iterations } },
    );
  }, [boardRef, waitForBoardUpdate, waitForActionableBoard, onActionExecuted]);

  const handleBack = useCallback(
    async (command: VoicePokerCommand): Promise<HandlerResult> => {
      if (command.seatNumber !== undefined) {
        await autoBackUntilSeat(command.seatNumber);
      } else {
        await onBack();
      }
      onActionExecuted?.({
        action: "back",
        amount: command.amount,
        seatNumber: command.seatNumber ?? null,
        timestamp: command.timestamp,
        processingTime: command.processingTime,
      });
      return CONTINUE_QUEUE;
    },
    [autoBackUntilSeat, onBack, onActionExecuted],
  );

  const handleOk = useCallback(async (): Promise<HandlerResult> => {
    await onEditGame();
    return CONTINUE_QUEUE;
  }, [onEditGame]);

  const handleCheckAround = useCallback(
    async (command: VoicePokerCommand): Promise<HandlerResult> => {
      const initialBoard = boardRef.current;
      if (!initialBoard || !isActionableBoard(initialBoard)) {
        return CONTINUE_QUEUE;
      }
      const activeCount = initialBoard.players.filter(isEvaluatable).length;
      if (activeCount <= 1) {
        warnVoiceAction("check around: 操作対象プレイヤーがいません");
        return CONTINUE_QUEUE;
      }
      if (
        command.streetAtCapture !== undefined &&
        command.streetAtCapture !== initialBoard.phase
      ) {
        warnVoiceAction(
          "ストリートが変わったためチェックアラウンドをキャンセルしました",
        );
        return CONTINUE_QUEUE;
      }
      if (initialBoard.currentBet > 0) {
        warnVoiceAction("ベットが入っているためチェックアラウンドは無効です");
        return CONTINUE_QUEUE;
      }
      await autoCheckAround();
      return CONTINUE_QUEUE;
    },
    [boardRef, autoCheckAround],
  );

  const handleNormalAction = useCallback(
    async (command: VoicePokerCommand): Promise<HandlerResult> => {
      const initialBoard = boardRef.current;
      if (!initialBoard || !isActionableBoard(initialBoard)) {
        return BREAK_QUEUE;
      }
      let currentBoard: TexasHoldemBoard = initialBoard;

      let effectiveSeatNumber: number | undefined = command.seatNumber;
      if (command.target?._kind === "position") {
        const pos = command.target.position;
        let targetPlayer: TexasHoldemBoard["players"][number] | undefined;
        if (pos === "btn") {
          targetPlayer = initialBoard.players.find(
            (p) => p.position === initialBoard.dealerPosition,
          );
        } else if (pos === "sb") {
          targetPlayer = initialBoard.players.find(
            (p) => p.position === initialBoard.sbPosition,
          );
        } else if (pos === "bb") {
          targetPlayer = initialBoard.players.find(
            (p) => p.position === initialBoard.bbPosition,
          );
        }
        if (!targetPlayer) {
          warnVoiceAction(
            `${command.target.position.toUpperCase()} ポジションのプレイヤーが見つかりません`,
          );
          return CONTINUE_QUEUE;
        }
        effectiveSeatNumber = targetPlayer.position;
      }

      if (effectiveSeatNumber !== undefined) {
        const currentPlayer = initialBoard.players.find(
          (p) => p.position === initialBoard.currentTurn,
        );
        if (currentPlayer && currentPlayer.position !== effectiveSeatNumber) {
          const resultBoard = await autoFoldUntilSeat(effectiveSeatNumber);
          if (!resultBoard) return CONTINUE_QUEUE;
          currentBoard = resultBoard;
        }
      }

      const executingSeat =
        currentBoard.players.find(
          (p) => p.position === currentBoard.currentTurn,
        )?.position ?? null;

      const resolvedCommand: VoicePokerCommand =
        command.action === null && command.amount !== null
          ? { ...command, action: classifyBetOrRaise(currentBoard) }
          : command;

      const executed = await executeAction(resolvedCommand, currentBoard);
      if (executed && resolvedCommand.action !== null) {
        onActionExecuted?.({
          action: resolvedCommand.action,
          amount: resolvedCommand.amount,
          seatNumber: command.seatNumber ?? executingSeat,
          timestamp: command.timestamp,
          processingTime: command.processingTime,
        });
        const boardUpdated = await waitForBoardUpdate(currentBoard);
        if (!boardUpdated) {
          warnVoiceAction("ボード更新タイムアウトのためキューを中断しました");
          return BREAK_QUEUE;
        }
        await sleep(POST_ACTION_SETTLE_MS);
      }
      return CONTINUE_QUEUE;
    },
    [
      boardRef,
      autoFoldUntilSeat,
      executeAction,
      waitForBoardUpdate,
      onActionExecuted,
    ],
  );

  const dispatchCommand = useCallback(
    async (command: VoicePokerCommand): Promise<HandlerResult> => {
      if (command.action === "back") return handleBack(command);
      if (command.action === "ok") return handleOk();
      if (command.action === "check-around") return handleCheckAround(command);
      return handleNormalAction(command);
    },
    [handleBack, handleOk, handleCheckAround, handleNormalAction],
  );

  const processNext = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (queueRef.current.length === 0) return;

    isProcessingRef.current = true;

    try {
      while (queueRef.current.length > 0) {
        const command = queueRef.current.shift();
        if (!command) break;

        if (command.confidence < voiceInputService.confidenceThreshold) {
          voiceInputService.emitStatusPublic(
            "listening",
            `信頼度不足 (${(command.confidence * 100).toFixed(0)}%): ${command.rawText}`,
          );
          continue;
        }

        try {
          const shouldContinue = await dispatchCommand(command);
          if (shouldContinue === BREAK_QUEUE) break;
        } catch (error) {
          trackClientSideError(
            error instanceof Error
              ? error.message
              : `[VoiceCommandQueue] コマンド処理中にエラー: ${String(error)}`,
            error instanceof Error
              ? {
                  stack: error.stack,
                  name: error.name,
                  cause: error.cause,
                  context: {
                    action: command.action,
                    seatNumber: command.seatNumber ?? null,
                    rawText: command.rawText,
                  },
                }
              : {
                  context: {
                    action: command.action,
                    seatNumber: command.seatNumber ?? null,
                    rawText: command.rawText,
                  },
                },
          );
        }
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [dispatchCommand]);

  const enqueue = useCallback(
    (command: VoicePokerCommand) => {
      let prepared: VoicePokerCommand = command;
      if (
        command.action === "check-around" &&
        command.streetAtCapture === undefined
      ) {
        const board = boardRef.current;
        if (board) {
          prepared = { ...command, streetAtCapture: board.phase };
        }
      }
      queueRef.current.push(prepared);
      processNext();
    },
    [boardRef, processNext],
  );

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      for (const id of activeIntervalsRef.current) {
        clearInterval(id);
      }
      activeIntervalsRef.current = [];
    };
  }, []);

  return { enqueue };
}
