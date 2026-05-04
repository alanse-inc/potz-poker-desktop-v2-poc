import { useTelop } from "../../../contexts/telop_context";
import type { TexasHoldemBoard } from "../../../types";
import { useAutoTelopData } from "../hooks/useAutoTelopData";
import { getActiveTelopPlayers, splitPlayersLeftRight } from "../utils";
import { TelopBroadcastAutoPage } from "./auto";
import { BroadcastCommunityCardsAndPot } from "./components/CommunityCardsAndPot";
import { BroadcastPlayerCards } from "./components/PlayerCards";

type Props = {
  board: TexasHoldemBoard;
};

function TelopBroadcastManual({ board }: Props) {
  const activePlayers = getActiveTelopPlayers(board);
  const { left, right } = splitPlayersLeftRight(activePlayers);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute bottom-4 left-4">
        <BroadcastPlayerCards
          board={board}
          players={left}
          side="left"
          size="small"
        />
      </div>

      <div className="absolute right-4 bottom-4">
        <BroadcastPlayerCards
          board={board}
          players={right}
          side="right"
          size="small"
        />
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <BroadcastCommunityCardsAndPot board={board} />
      </div>
    </div>
  );
}

function TelopBroadcastAutoWrapper() {
  const { board, players } = useAutoTelopData();
  return <TelopBroadcastAutoPage board={board} players={players} />;
}

export function TelopBroadcastPage({ board }: Props) {
  const { currentScreen } = useTelop();
  const isAutoMode = currentScreen === "auto-setting";

  if (isAutoMode) {
    return <TelopBroadcastAutoWrapper />;
  }

  return <TelopBroadcastManual board={board} />;
}
