import { useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { api } from "../../../../api/client";
import { useAutoModeInitializeBoardCommand } from "../../../../contexts/auto_mode_initialize_board_command_context";
import { useTelop } from "../../../../contexts/telop_context";

export function useAutoGameSettings() {
  const navigate = useNavigate();
  const { isOpen, setIsOpen, setCurrentScreen } = useTelop();
  const { initializeBoardCommand, isStartable } =
    useAutoModeInitializeBoardCommand();

  useEffect(() => {
    setCurrentScreen("auto-setting");
    return () => {
      setCurrentScreen(null);
    };
  }, [setCurrentScreen]);

  const handleCaptionWindowToggle = useCallback(async () => {
    try {
      if (isOpen) {
        await api.telop.close();
        setIsOpen(false);
      } else {
        await api.telop.open();
        setIsOpen(true);
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "テロップウィンドウの操作に失敗しました",
      );
    }
  }, [isOpen, setIsOpen]);

  const handleClickAdvancedSetting = useCallback(() => {
    navigate("/auto-game/advanced-setting");
  }, [navigate]);

  return {
    setting: initializeBoardCommand.input.setting,
    isStartable,
    onCaptionWindowToggle: handleCaptionWindowToggle,
    onClickAdvancedSetting: handleClickAdvancedSetting,
  };
}
