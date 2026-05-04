import { useTelop } from "../../../contexts/telop_context";
import type { TexasHoldemBoard } from "../../../types";
import { useAutoTelopData } from "../hooks/useAutoTelopData";
import { getActiveTelopPlayers, splitPlayersLeftRight } from "../utils";
import { TelopModernAutoPage } from "./auto";
import { ModernCommunityCardsAndPot } from "./components/CommunityCardsAndPot";
import { ModernPlayerCards } from "./components/PlayerCards";

type Props = {
  board: TexasHoldemBoard;
};

function TelopModernManual({ board }: Props) {
  const activePlayers = getActiveTelopPlayers(board);
  const { left, right } = splitPlayersLeftRight(activePlayers);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute bottom-4 left-4">
        <ModernPlayerCards
          board={board}
          players={left}
          side="left"
          size="small"
        />
      </div>

      <div className="absolute right-4 bottom-4">
        <ModernPlayerCards
          board={board}
          players={right}
          side="right"
          size="small"
        />
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <ModernCommunityCardsAndPot board={board} />
      </div>
    </div>
  );
}

function TelopModernAutoWrapper() {
  const { board, players } = useAutoTelopData();
  return <TelopModernAutoPage board={board} players={players} />;
}

export function TelopModernPage({ board }: Props) {
  const { currentScreen } = useTelop();
  const isAutoMode = currentScreen === "auto-setting";

  if (isAutoMode) {
    return <TelopModernAutoWrapper />;
  }

  return <TelopModernManual board={board} />;
}
