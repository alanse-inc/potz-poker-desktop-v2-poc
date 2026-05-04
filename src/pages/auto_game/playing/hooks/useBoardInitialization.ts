import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { useAutoBoard } from "../../../../contexts/auto_board_context";
import { useAutoModeInitializeBoardCommand } from "../../../../contexts/auto_mode_initialize_board_command_context";
import { useSession } from "../../../../contexts/session_context";
import {
  assignPositions,
  initializePlayers,
} from "../../../../domain/auto_game/player";
import type { AutoModeBoard } from "../../../../domain/auto_game/types";
import { trackClientSideError } from "../../../../features/error_tracker";

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

    const initializeBoard = async () => {
      try {
        const cmd = initializeBoardCommandRef.current;
        const players = cmd.input.players;
        const setting = cmd.input.setting;

        if (players.length < 2) {
          throw new Error("プレイヤーは 2 人以上必要です");
        }

        const btnPlayer = players.find(
          (p) => p.position === "btn" || p.position === "btn_sb",
        );
        if (!btnPlayer) {
          throw new Error("BTNプレイヤーが設定されていません");
        }

        const initializedPlayers = initializePlayers(
          players.map((p) => ({
            id: p.id,
            name: p.name,
            icon: p.icon ?? null,
            seat: p.seat,
          })),
        );

        const playersWithPositions = assignPositions(
          initializedPlayers,
          btnPlayer.id,
        );

        const newBoard: AutoModeBoard = {
          setting: { name: setting.name },
          players: playersWithPositions,
          communityCards: [],
          burnCards: [],
          handNumber: lastHandNumberRef.current + 1,
          winners: null,
        };

        setBoardRef.current(newBoard);
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

    initializeBoard();
  }, []); // intentionally empty: runs once on mount

  return {
    board,
    setBoard,
    isInitializing,
  };
}
