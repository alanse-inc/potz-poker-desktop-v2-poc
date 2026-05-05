import { produce } from "immer";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { api } from "../../api/client";
import { useBoard } from "../../contexts/board_context";
import { Board, type BoardProps, type SeatContent } from "../../features/board";
import { DealerIcon } from "../../features/dealer_icon";
import { PlayerEditModal } from "../../features/modal/player_edit_modal";
import { useAutoScale } from "../../hooks/useAutoScale";
import { RoundButton } from "../../ui/button/round_button";
import { BasicPage } from "../../ui/page/basic";
import { AddPlayerModal } from "../game/playing/components/add_player_modal";

const EMPTY_SEATS: BoardProps["seats"] = {
  1: { playerCard: undefined },
  2: { playerCard: undefined },
  3: { playerCard: undefined },
  4: { playerCard: undefined },
  5: { playerCard: undefined },
  6: { playerCard: undefined },
  7: { playerCard: undefined },
  8: { playerCard: undefined },
  9: { playerCard: undefined },
  10: { playerCard: undefined },
};

function positionToSeat(
  position: number,
): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 {
  return (position + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
}

/**
 * 次の BTN 位置を計算する。
 * Rust 側の `(dealer_position + 1) % players.len()` と同じロジック。
 * remove_player は position を常に 0..n-1 に詰め直すため、
 * dealerPosition は players 配列のインデックスと一致する。
 */
function computeNextDealerPosition(
  dealerPosition: number,
  players: { position: number }[],
): number | null {
  const n = players.length;
  if (n === 0) return null;
  return (dealerPosition + 1) % n;
}

export function NextGame() {
  const { board, refresh } = useBoard();
  const navigate = useNavigate();
  const [editPlayerPosition, setEditPlayerPosition] = useState<number | null>(
    null,
  );
  const [isOpenAddPlayer, setIsOpenAddPlayer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.4);

  const handleNextGame = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.board.moveNextGame();
      await refresh();
      navigate("/game/playing");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "次のゲームへ進めませんでした";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [navigate, refresh]);

  const handlePlayerEdited = useCallback(async () => {
    try {
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ボードの更新に失敗しました";
      toast.error(msg);
    }
  }, [refresh]);

  if (!board) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black-deep">
        <p className="font-bold text-white">ゲームが開始されていません</p>
      </div>
    );
  }

  const nextDealerPosition = computeNextDealerPosition(
    board.dealerPosition,
    board.players,
  );

  const seats = produce(EMPTY_SEATS, (draft) => {
    for (const player of board.players) {
      const seat = positionToSeat(player.position);
      const isNextDealer = player.position === nextDealerPosition;
      const seatContent: SeatContent = {
        playerCard: (
          <button
            key={player.position}
            type="button"
            className="flex cursor-pointer flex-col items-center justify-center p-2"
            onClick={() => setEditPlayerPosition(player.position)}
          >
            <div className="w-32">
              <div className="flex h-14 flex-col items-start justify-start rounded-t-xl border-gray-800 border-x-3 border-t-3 bg-gray-900 px-3 pt-1 font-bold text-white text-xs">
                <div>{player.name || "NO NAME"}</div>
                <div>{player.stack.toLocaleString()}</div>
              </div>
              <div className="h-7 rounded-b-xl border-3 border-white bg-white px-3 text-left font-bold text-gray-900 text-xs" />
            </div>
          </button>
        ),
        otherItem: isNextDealer ? <DealerIcon /> : undefined,
      };
      draft[seat] = seatContent;
    }
  });

  const centerContent = (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="font-bold text-primary text-sm">NEXT GAME 準備</p>
      <p className="text-gray-300 text-xs">Hand #{board.handNumber + 1}</p>
      <p className="text-gray-400 text-xs">{board.players.length} 人参加中</p>
    </div>
  );

  const editTargetPlayer =
    editPlayerPosition !== null
      ? board.players.find((p) => p.position === editPlayerPosition)
      : undefined;

  return (
    <>
      <BasicPage>
        <div className="relative flex h-full w-full flex-col items-center p-4 pb-2 lg:p-8 lg:pb-4">
          {/* ヘッダー */}
          <div className="flex h-14 w-full items-center justify-between">
            <RoundButton
              type="black"
              text="BACK"
              size="auto"
              onClick={() => navigate("/game/playing")}
            />
            <div className="flex items-center gap-4">
              <RoundButton
                type="black"
                text="+ プレイヤー"
                size="auto"
                onClick={() => setIsOpenAddPlayer(true)}
                disabled={board.players.length >= 10}
              />
              <RoundButton
                type="primary"
                text={isLoading ? "開始中..." : "NEXT GAME"}
                size="auto"
                disabled={isLoading}
                onClick={handleNextGame}
              />
            </div>
          </div>

          {/* メインコンテンツ: Board */}
          <div
            ref={containerRef}
            className="relative flex w-full flex-1 items-center justify-center"
          >
            <div
              ref={contentRef}
              className="absolute"
              style={{
                width: "950px",
                height: "400px",
              }}
            >
              <div className="flex h-full items-center justify-center">
                <Board seats={seats} centerContent={centerContent} />
              </div>
            </div>
          </div>

          {/* フッター余白 */}
          <div className="h-14 w-full" />
        </div>
      </BasicPage>

      {editTargetPlayer && (
        <PlayerEditModal
          player={editTargetPlayer}
          isShowdown={true}
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
    </>
  );
}
