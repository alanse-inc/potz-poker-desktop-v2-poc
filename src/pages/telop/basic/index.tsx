import { useTelop } from "../../../contexts/telop_context";
import type { TexasHoldemBoard } from "../../../types";
import { useAutoTelopData } from "../hooks/useAutoTelopData";
import { getActiveTelopPlayers, splitPlayersLeftRight } from "../utils";
import { TelopBasicAutoPage } from "./auto";
import { BasicCommunityCardsAndPot } from "./components/CommunityCardsAndPot";
import { BasicPlayerCards } from "./components/PlayerCards";

type Props = {
  board: TexasHoldemBoard;
};

function TelopBasicManual({ board }: Props) {
  const activePlayers = getActiveTelopPlayers(board);
  const { left, right } = splitPlayersLeftRight(activePlayers);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute bottom-4 left-4">
        <BasicPlayerCards
          board={board}
          players={left}
          side="left"
          size="small"
        />
      </div>

      <div className="absolute right-4 bottom-4">
        <BasicPlayerCards
          board={board}
          players={right}
          side="right"
          size="small"
        />
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <BasicCommunityCardsAndPot board={board} />
      </div>
    </div>
  );
}

function TelopBasicAutoWrapper() {
  const { board, players } = useAutoTelopData();
  return <TelopBasicAutoPage board={board} players={players} />;
}

export function TelopBasicPage({ board }: Props) {
  const { currentScreen } = useTelop();
  const isAutoMode = currentScreen === "auto-setting";

  if (isAutoMode) {
    return <TelopBasicAutoWrapper />;
  }

  return <TelopBasicManual board={board} />;
}
