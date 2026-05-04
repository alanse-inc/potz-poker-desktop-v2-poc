import type { TexasHoldemBoard } from "../../../types";
import { getActiveTelopPlayers, splitPlayersLeftRight } from "../utils";
import { BasicCommunityCardsAndPot } from "./components/CommunityCardsAndPot";
import { BasicPlayerCards } from "./components/PlayerCards";

type Props = {
  board: TexasHoldemBoard;
};

/**
 * Basic テーマ テロップページ
 * プレイヤーカードを左右に分割表示し、中央にコミュニティカードを表示する
 */
export function TelopBasicPage({ board }: Props) {
  const activePlayers = getActiveTelopPlayers(board);
  const { left, right } = splitPlayersLeftRight(activePlayers);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* 左側プレイヤー */}
      <div className="absolute bottom-4 left-4">
        <BasicPlayerCards
          board={board}
          players={left}
          side="left"
          size="small"
        />
      </div>

      {/* 右側プレイヤー */}
      <div className="absolute right-4 bottom-4">
        <BasicPlayerCards
          board={board}
          players={right}
          side="right"
          size="small"
        />
      </div>

      {/* コミュニティカード + ポット */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <BasicCommunityCardsAndPot board={board} />
      </div>
    </div>
  );
}
