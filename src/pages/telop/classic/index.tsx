import type { TexasHoldemBoard } from "../../../types";
import { getActiveTelopPlayers, splitPlayersLeftRight } from "../utils";
import { ClassicCommunityCardsAndPot } from "./components/CommunityCardsAndPot";
import { ClassicPlayerCards } from "./components/PlayerCards";

type Props = {
  board: TexasHoldemBoard;
};

/**
 * Classic テーマ テロップページ
 * Oswald フォント、3段構造レイアウト
 */
export function TelopClassicPage({ board }: Props) {
  const activePlayers = getActiveTelopPlayers(board);
  const { left, right } = splitPlayersLeftRight(activePlayers);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* 左側プレイヤー */}
      <div className="absolute bottom-4 left-4">
        <ClassicPlayerCards
          board={board}
          players={left}
          side="left"
          size="small"
        />
      </div>

      {/* 右側プレイヤー */}
      <div className="absolute right-4 bottom-4">
        <ClassicPlayerCards
          board={board}
          players={right}
          side="right"
          size="small"
        />
      </div>

      {/* コミュニティカード + ポット */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <ClassicCommunityCardsAndPot board={board} />
      </div>
    </div>
  );
}
