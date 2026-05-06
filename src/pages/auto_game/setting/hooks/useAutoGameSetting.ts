import { useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router";
import { useAutoBoard } from "../../../../contexts/auto_board_context";
import { useAutoModeInitializeBoardCommand } from "../../../../contexts/auto_mode_initialize_board_command_context";
import { useSession } from "../../../../contexts/session_context";
import { trackClientSideError } from "../../../../features/error_tracker";
import { initializeBoard } from "../../../../workflow/auto_game/initialize_board";
import { useAutoGameSettings } from "./useAutoGameSettings";

export function useAutoGameSetting() {
  const navigate = useNavigate();
  const location = useLocation();

  const { initializeBoardCommand, setBtnPosition } =
    useAutoModeInitializeBoardCommand();
  const { setBoard } = useAutoBoard();
  const { isStartable, onCaptionWindowToggle, onClickAdvancedSetting } =
    useAutoGameSettings();
  const { lastHandNumber } = useSession();

  const players = initializeBoardCommand.input.players;
  const setting = initializeBoardCommand.input.setting;

  // select-btn ページからの戻り値を処理
  useEffect(() => {
    const state = location.state as { selectedBtnSeat?: number } | null;
    if (state?.selectedBtnSeat) {
      setBtnPosition(
        state.selectedBtnSeat as Parameters<typeof setBtnPosition>[0],
      );
      navigate("/auto-game/setting", { replace: true, state: {} });
    }
  }, [location.state, setBtnPosition, navigate]);

  const handleGameStart = useCallback(async () => {
    if (!isStartable) return;

    const result = initializeBoard({
      setting: { name: setting.name },
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon ?? null,
        seat: p.seat,
        position: p.position,
      })),
      handNumber: lastHandNumber + 1,
    });

    if (result.isErr()) {
      const { kind } = result.error;
      const message =
        kind === "insufficient_players"
          ? "プレイヤーは 2 人以上必要です"
          : "BTNプレイヤーが設定されていません";
      trackClientSideError("[AutoGameSetting] Failed to initialize board", {
        cause: kind,
      });
      toast.error(message);
      return;
    }

    setBoard(result.value);
    navigate("/auto-game/playing");
  }, [isStartable, players, setting.name, lastHandNumber, setBoard, navigate]);

  const handleBack = useCallback(() => {
    navigate("/deck/choose");
  }, [navigate]);

  const handleChangeGameMode = useCallback(() => {
    navigate("/game/first-game/setting");
  }, [navigate]);

  const handleBtnButtonClick = useCallback(() => {
    navigate("/auto-game/select-btn", {
      state: { players, gameName: setting.name },
    });
  }, [navigate, players, setting.name]);

  return {
    players,
    setting,
    isStartable,
    onCaptionWindowToggle,
    onClickAdvancedSetting,
    onChangeGameMode: handleChangeGameMode,
    handleBtnButtonClick,
    handleBack,
    handleGameStart,
  };
}
