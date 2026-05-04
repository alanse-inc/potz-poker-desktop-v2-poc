import { TelopBasicPage } from "./basic";
import { TelopBroadcastPage } from "./broadcast";
import { TelopClassicPage } from "./classic";
import { useTelopBoard } from "./hooks/useTelopBoard";
import { useTelopMode } from "./hooks/useTelopMode";
import { MOCK_BOARD } from "./mock";
import { TelopModernPage } from "./modern";

/**
 * テロップウィンドウのルートコンポーネント
 * TelopState.mode に応じて 4 つのテーマを切り替える
 */
export function TelopPage() {
  const mode = useTelopMode();
  const { board } = useTelopBoard();

  // board が null の場合（ゲーム未開始など）はモックボードを表示
  const displayBoard = board ?? MOCK_BOARD;

  switch (mode) {
    case "classic":
      return <TelopClassicPage board={displayBoard} />;
    case "modern":
      return <TelopModernPage board={displayBoard} />;
    case "broadcast":
      return <TelopBroadcastPage board={displayBoard} />;
    default:
      return <TelopBasicPage board={displayBoard} />;
  }
}
