import type { TexasHoldemBoard } from "../../../types";
import { getActiveTelopPlayers, splitPlayersLeftRight } from "../utils";
import { ModernCommunityCardsAndPot } from "./components/CommunityCardsAndPot";
import { ModernPlayerCards } from "./components/PlayerCards";

type Props = {
  board: TexasHoldemBoard;
};

/**
 * Modern テーマ テロップページ
 * FuturaPT フォント、白黒コントラストなデザイン
 */
export function TelopModernPage({ board }: Props) {
  const activePlayers = getActiveTelopPlayers(board);
  const { left, right } = splitPlayersLeftRight(activePlayers);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* 左側プレイヤー */}
      <div className="absolute bottom-4 left-4">
        <ModernPlayerCards
          board={board}
          players={left}
          side="left"
          size="small"
        />
      </div>

      {/* 右側プレイヤー */}
      <div className="absolute right-4 bottom-4">
        <ModernPlayerCards
          board={board}
          players={right}
          side="right"
          size="small"
        />
      </div>

      {/* コミュニティカード + ポット */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <ModernCommunityCardsAndPot board={board} />
      </div>
    </div>
  );
}
