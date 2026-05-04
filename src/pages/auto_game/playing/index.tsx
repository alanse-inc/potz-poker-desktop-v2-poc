/**
 * Auto Game プレイ画面
 *
 * Electron 版の pages/auto_game/playing を Tauri 版に移植
 *
 * 機能:
 * - プレイヤーカードのシングルクリック → Fold
 * - プレイヤーカードのダブルクリック → Unfold
 * - NEXT GAME ボタン → 次ゲームへ移行
 * - EXIT TO EDIT → 設定画面に戻る (確認モーダル付き)
 * - RFID カード配置イベントの処理
 */

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { api } from "../../../api/client";
import { useAutoBoard } from "../../../contexts/auto_board_context";
import {
  addBurnCard,
  addCommunityCard,
  updatePlayerHand,
} from "../../../domain/auto_game/board";
import type { AutoModeBoard } from "../../../domain/auto_game/types";
import { SmallCard } from "../../../features/card/face/small_size";
import { SmallReverseCard } from "../../../features/card/reverse/small_size";
import { ActionConfirmModal } from "../../../features/modal/action_confirm_modal";
import { useAutoScale } from "../../../hooks/useAutoScale";
import type { CardPlacedPayload } from "../../../types";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import { Switch } from "../../../ui/switch";
import { executeFold, executeUnfold } from "../../../workflow/auto_game/fold";
import { moveNextGame } from "../../../workflow/auto_game/move_next_game";
import { PlayingBoard } from "./components/playing_board";

const CLICK_DELAY_MS = 300;

export function AutoGamePlaying() {
  const navigate = useNavigate();
  const { board, setBoard, resetBoard } = useAutoBoard();
  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  // オプティミスティック UI 用
  const [optimisticBoard, setOptimisticBoard] = useState<AutoModeBoard | null>(
    null,
  );
  const optimisticBoardRef = useRef<AutoModeBoard | null>(null);

  // board と setBoard を ref 経由で参照 (useEffect のクロージャで古い値を参照しないよう)
  const boardRef = useRef(board);
  boardRef.current = board;
  const setBoardRef = useRef(setBoard);
  setBoardRef.current = setBoard;

  // シングル/ダブルクリック判定タイマー
  const clickTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Fold キュー
  type FoldOp = { playerId: string; type: "fold" | "unfold" };
  const foldQueueRef = useRef<FoldOp[]>([]);
  const isProcessingRef = useRef(false);

  // RFID カード配置イベントを購読
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      const unlistenCardPlaced = await api.notifications.onCardPlaced(
        async (payload: CardPlacedPayload) => {
          const currentBoard = optimisticBoardRef.current ?? boardRef.current;
          if (!currentBoard) return;

          const { card, position } = payload;
          let updatedBoard: AutoModeBoard;

          if (position.type === "communityCard") {
            updatedBoard = addCommunityCard(currentBoard, card);
          } else if (position.type === "playerHand") {
            updatedBoard = updatePlayerHand(currentBoard, position.seat, card);
          } else if (position.type === "burnCard") {
            updatedBoard = addBurnCard(currentBoard, card);
          } else {
            return;
          }

          setBoardRef.current(updatedBoard);
          optimisticBoardRef.current = updatedBoard;
          setOptimisticBoard(updatedBoard);
          toast.success("カードを読み込みました");
        },
      );

      const unlistenUnregistered =
        await api.notifications.onCardPlacedUnregistered(() => {
          toast.error("デッキに登録されていないカードです");
        });

      if (cancelled) {
        unlistenCardPlaced();
        unlistenUnregistered();
        return;
      }

      unlisten = () => {
        unlistenCardPlaced();
        unlistenUnregistered();
      };
    };

    setup();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Fold キュー処理
  const processFoldQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (foldQueueRef.current.length === 0) return;

    isProcessingRef.current = true;
    let currentBoard: AutoModeBoard | undefined =
      optimisticBoardRef.current ?? board ?? undefined;

    try {
      while (foldQueueRef.current.length > 0) {
        const op = foldQueueRef.current.shift();
        if (!op || !currentBoard) break;

        const result =
          op.type === "fold"
            ? executeFold(currentBoard, op.playerId)
            : executeUnfold(currentBoard, op.playerId);

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

      const optimistic = executeFold(baseBoard, playerId);
      if (!optimistic.ok) return;

      optimisticBoardRef.current = optimistic.board;
      setOptimisticBoard(optimistic.board);

      foldQueueRef.current.push({ playerId, type: "fold" });
      processFoldQueue();
    },
    [board, processFoldQueue],
  );

  const handleUnfold = useCallback(
    (playerId: string) => {
      const baseBoard = optimisticBoardRef.current ?? board;
      if (!baseBoard) return;

      const optimistic = executeUnfold(baseBoard, playerId);
      if (!optimistic.ok) return;

      optimisticBoardRef.current = optimistic.board;
      setOptimisticBoard(optimistic.board);

      foldQueueRef.current.push({ playerId, type: "unfold" });
      processFoldQueue();
    },
    [board, processFoldQueue],
  );

  const handlePlayerCardPress = useCallback(
    (playerId: string) => {
      const timerMap = clickTimerRef.current;
      const existing = timerMap.get(playerId);

      if (existing !== undefined) {
        // ダブルクリック → Unfold
        clearTimeout(existing);
        timerMap.delete(playerId);
        handleUnfold(playerId);
        return;
      }

      // シングルクリック → Fold
      const timer = setTimeout(() => {
        timerMap.delete(playerId);
        handleFold(playerId);
      }, CLICK_DELAY_MS);

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

  const handleExitToEdit = useCallback(() => {
    setIsExitModalOpen(false);
    resetBoard();
    navigate("/auto-game/setting");
  }, [navigate, resetBoard]);

  const handleChangeGameMode = useCallback(() => {
    navigate("/game/first-game/setting");
  }, [navigate]);

  const displayBoard = optimisticBoard ?? board;

  if (!displayBoard) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black-deep">
        <p className="font-bold text-white">ゲームが開始されていません</p>
      </div>
    );
  }

  return (
    <BasicPage>
      <div className="relative flex h-full w-full flex-col items-center justify-between gap-40 p-8">
        <div className="flex h-20 w-full items-center justify-end">
          <Switch
            text="AUTO MODE"
            checked={true}
            disabled={true}
            onChange={handleChangeGameMode}
          />
        </div>

        <div
          ref={containerRef}
          className="relative flex w-full flex-1 items-center justify-center"
        >
          <div
            ref={contentRef}
            className="absolute"
            style={{ width: "950px", height: "400px" }}
          >
            <div className="relative flex h-full items-center justify-center">
              <PlayingBoard
                board={displayBoard}
                onPlayerCardPress={handlePlayerCardPress}
              />
              {/* 中央: テーブル名・NEXT GAME・コミュニティカード */}
              <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4">
                {displayBoard.setting.name && (
                  <div className="font-bold text-2xl text-white">
                    {displayBoard.setting.name}
                  </div>
                )}
                <RoundButton
                  text="NEXT GAME"
                  type="primary"
                  size="auto"
                  onClick={handleNextGame}
                />
                {/* コミュニティカード (5 枚): スロットは位置固定 */}
                <div className="flex gap-1">
                  {([0, 1, 2, 3, 4] as const).map((slot) =>
                    displayBoard.communityCards[slot] ? (
                      <SmallCard
                        key={`cc-${slot}`}
                        card={displayBoard.communityCards[slot]}
                      />
                    ) : (
                      <div
                        className="brightness-50 filter"
                        key={`cc-empty-${slot}`}
                      >
                        <SmallReverseCard />
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-20 w-full items-center justify-end gap-4">
          <RoundButton
            text="EXIT TO EDIT"
            type="dark-gray"
            size="auto"
            onClick={() => setIsExitModalOpen(true)}
            className="!border !border-[#FF483B] !text-[#FF483B]"
          />
        </div>
      </div>

      {isExitModalOpen && (
        <ActionConfirmModal
          title="このゲームを終了してよいですか？"
          description="終了後に編集画面に遷移します"
          cancelButtonText="CANCEL"
          confirmButtonText="OK"
          onCloseClick={() => setIsExitModalOpen(false)}
          onConfirmClick={handleExitToEdit}
        />
      )}
    </BasicPage>
  );
}
