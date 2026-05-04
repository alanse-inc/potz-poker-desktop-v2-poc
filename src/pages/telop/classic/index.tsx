import { useTelop } from "../../../contexts/telop_context";
import type { TexasHoldemBoard } from "../../../types";
import { useAutoTelopData } from "../hooks/useAutoTelopData";
import { getActiveTelopPlayers, splitPlayersLeftRight } from "../utils";
import { TelopClassicAutoPage } from "./auto";
import { ClassicCommunityCardsAndPot } from "./components/CommunityCardsAndPot";
import { ClassicPlayerCards } from "./components/PlayerCards";

type Props = {
  board: TexasHoldemBoard;
};

function TelopClassicManual({ board }: Props) {
  const activePlayers = getActiveTelopPlayers(board);
  const { left, right } = splitPlayersLeftRight(activePlayers);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute bottom-4 left-4">
        <ClassicPlayerCards
          board={board}
          players={left}
          side="left"
          size="small"
        />
      </div>

      <div className="absolute right-4 bottom-4">
        <ClassicPlayerCards
          board={board}
          players={right}
          side="right"
          size="small"
        />
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <ClassicCommunityCardsAndPot board={board} />
      </div>
    </div>
  );
}

function TelopClassicAutoWrapper() {
  const { board, players } = useAutoTelopData();
  return <TelopClassicAutoPage board={board} players={players} />;
}

export function TelopClassicPage({ board }: Props) {
  const { currentScreen } = useTelop();
  const isAutoMode = currentScreen === "auto-setting";

  if (isAutoMode) {
    return <TelopClassicAutoWrapper />;
  }

  return <TelopClassicManual board={board} />;
}
