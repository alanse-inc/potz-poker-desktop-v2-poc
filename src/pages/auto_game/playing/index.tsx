import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { api } from "../../../api/client";
import { useAutoBoard } from "../../../contexts/auto_board_context";
import {
  addBurnCard,
  addCommunityCard,
  determineAutoNextCardPosition,
  updatePlayerHand,
} from "../../../domain/auto_game/board";
import type { AutoModeBoard } from "../../../domain/auto_game/types";
import { SmallCard } from "../../../features/card/face/small_size";
import { SmallReverseCard } from "../../../features/card/reverse/small_size";
import { ActionConfirmModal } from "../../../features/modal/action_confirm_modal";
import { useAutoScale } from "../../../hooks/useAutoScale";
import type { AutoCardPlacedPayload } from "../../../types";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import { Switch } from "../../../ui/switch";
import { PlayingBoard } from "./components/playing_board";
import { useGameActions } from "./hooks/useGameActions";

export function AutoGamePlaying() {
  const { board, setBoard } = useAutoBoard();
  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  const {
    optimisticBoard,
    isExitModalOpen,
    onPlayerCardPress,
    onNextGame,
    onChangeGameMode,
    onOpenExitModal,
    onCloseExitModal,
    onExitToEdit,
  } = useGameActions();

  const optimisticBoardRef = useRef<AutoModeBoard | null>(null);
  optimisticBoardRef.current = optimisticBoard;
  const boardRef = useRef(board);
  boardRef.current = board;
  const setBoardRef = useRef(setBoard);
  setBoardRef.current = setBoard;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      // Auto Mode 中は auto_card_placed イベントを購読する。
      // Rust board が None のため card_placed は発火しない。
      // position はフロント側の AutoModeBoard から決定する。
      const unlistenAutoCardPlaced = await api.notifications.onAutoCardPlaced(
        (payload: AutoCardPlacedPayload) => {
          if (cancelled) return;
          const currentBoard = optimisticBoardRef.current ?? boardRef.current;
          if (!currentBoard) return;

          const { card } = payload;
          const position = determineAutoNextCardPosition(currentBoard);
          if (!position) return;

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
          toast.success("カードを読み込みました");
        },
      );

      if (cancelled) {
        unlistenAutoCardPlaced();
        return;
      }

      const unlistenUnregistered =
        await api.notifications.onCardPlacedUnregistered(() => {
          if (cancelled) return;
          toast.error("デッキに登録されていないカードです");
        });

      if (cancelled) {
        unlistenAutoCardPlaced();
        unlistenUnregistered();
        return;
      }

      unlisten = () => {
        unlistenAutoCardPlaced();
        unlistenUnregistered();
      };
    };

    setup();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

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
            onChange={onChangeGameMode}
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
                onPlayerCardPress={onPlayerCardPress}
              />
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
                  onClick={onNextGame}
                />
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
            onClick={onOpenExitModal}
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
          onCloseClick={onCloseExitModal}
          onConfirmClick={onExitToEdit}
        />
      )}
    </BasicPage>
  );
}
