import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { useAutoBoard } from "../../../../contexts/auto_board_context";
import { useAutoModeInitializeBoardCommand } from "../../../../contexts/auto_mode_initialize_board_command_context";
import { useSession } from "../../../../contexts/session_context";
import { trackClientSideError } from "../../../../features/error_tracker";
import { initializeBoard } from "../../../../workflow/auto_game/initialize_board";

export function useBoardInitialization() {
  const navigate = useNavigate();
  const { board, setBoard } = useAutoBoard();
  const { initializeBoardCommand } = useAutoModeInitializeBoardCommand();
  const { lastHandNumber } = useSession();
  const [isInitializing, setIsInitializing] = useState(true);

  // Refs to avoid stale closure in one-shot effect
  const initializeBoardCommandRef = useRef(initializeBoardCommand);
  initializeBoardCommandRef.current = initializeBoardCommand;
  const lastHandNumberRef = useRef(lastHandNumber);
  lastHandNumberRef.current = lastHandNumber;
  const boardRef = useRef(board);
  boardRef.current = board;
  const setBoardRef = useRef(setBoard);
  setBoardRef.current = setBoard;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (boardRef.current) {
      setIsInitializing(false);
      return;
    }

    const runInitializeBoard = async () => {
      try {
        const cmd = initializeBoardCommandRef.current;
        const players = cmd.input.players;
        const setting = cmd.input.setting;

        const result = initializeBoard({
          setting: { name: setting.name },
          players: players.map((p) => ({
            id: p.id,
            name: p.name,
            icon: p.icon ?? null,
            seat: p.seat,
            position: p.position,
          })),
          handNumber: lastHandNumberRef.current + 1,
        });

        if (result.isErr()) {
          const { kind } = result.error;
          trackClientSideError("[AutoGamePlaying] Failed to initialize board", {
            cause: kind,
          });
          toast.error("ボード初期化に失敗しました");
          navigateRef.current("/auto-game/setting");
          return;
        }

        setBoardRef.current(result.value);
      } catch (error) {
        trackClientSideError("[AutoGamePlaying] Failed to initialize board", {
          cause: error,
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
        });
        toast.error("ボード初期化に失敗しました");
        navigateRef.current("/auto-game/setting");
      } finally {
        setIsInitializing(false);
      }
    };

    runInitializeBoard();
  }, []); // intentionally empty: runs once on mount

  return {
    board,
    setBoard,
    isInitializing,
  };
}
