import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { apiFetch } from "../../../../api/fetch";
import {
  type PlayerSeatRange,
  useInitializeBoardCommand,
} from "../../../../contexts/initialize_board_command_context";
import type { EditPlayerData } from "../../../../features/modal/auto_mode_player_edit_modal";
import { useReconcileCheckedOutPlayers } from "../../../../hooks/useReconcileCheckedOutPlayers";
import { useRestoreSessionFromPreferences } from "../../../../hooks/useRestoreSessionFromPreferences";
import { LoadingSpinner } from "../../../../ui/loading_spinner";
import { Page } from "./page";
import type {
  ChipSettingKey,
  NextGameConfirmProps,
  SettingHandlers,
} from "./types";

export function NextGameSetting() {
  const {
    initializeBoardCommand,
    isStartable,
    updateInitializeBoardSetting,
    updatePlayer,
    deletePlayer,
  } = useInitializeBoardCommand();

  useReconcileCheckedOutPlayers();
  useRestoreSessionFromPreferences("NextGameSetting");

  const navigate = useNavigate();
  const [selectedSeat, setSelectedSeat] = useState<PlayerSeatRange | null>(
    null,
  );
  const [selectedButton, setSelectedButton] = useState<ChipSettingKey | null>(
    null,
  );
  const [chipInputValue, setChipInputValue] = useState<number>(0);

  const { input } = initializeBoardCommand;

  const selectedPlayer = input.players.find((p) => p.seat === selectedSeat);

  const handleHome = useCallback(() => {
    navigate("/game/first-game/setting");
  }, [navigate]);

  const handleClickAdvancedSetting = useCallback(() => {
    navigate("/game/next-game/advanced-setting");
  }, [navigate]);

  const handleBtnButtonClick = useCallback(() => {
    const hasNonLeavedPlayer = input.players.some((p) => p.status !== "leaved");
    if (!hasNonLeavedPlayer) return;
    navigate("/game/next-game/select-btn");
  }, [input.players, navigate]);

  const handleSelectButton = useCallback(
    (key: ChipSettingKey | null) => {
      setSelectedButton(key);
      if (key === "smallBlind") setChipInputValue(input.setting.smallBlind);
      else if (key === "bigBlind") setChipInputValue(input.setting.bigBlind);
      else if (key === "miniChip") setChipInputValue(input.setting.miniChip);
      else setChipInputValue(0);
    },
    [input.setting],
  );

  const chipInputModalTitle = useMemo(() => {
    if (selectedButton === "smallBlind") return "SBはいくらですか？";
    if (selectedButton === "bigBlind") return "BBはいくらですか？";
    if (selectedButton === "miniChip") return "minichipはいくらですか？";
    return "";
  }, [selectedButton]);

  const handleChipInputSave = useCallback(
    (value: number) => {
      if (!selectedButton) return;
      updateInitializeBoardSetting(selectedButton, value);
      setSelectedButton(null);
    },
    [selectedButton, updateInitializeBoardSetting],
  );

  const handleAnteRuleToggle = useCallback(() => {
    const next = input.setting.anteRule === "none" ? "bbante" : "none";
    updateInitializeBoardSetting("anteRule", next);
  }, [input.setting.anteRule, updateInitializeBoardSetting]);

  const handleClickSeat = useCallback((seat: PlayerSeatRange) => {
    setSelectedSeat(seat);
  }, []);

  const handleJoin = useCallback(
    (editPlayerData: EditPlayerData) => {
      if (!selectedSeat || !editPlayerData.name) return;
      const existing = input.players.find((p) => p.seat === selectedSeat);
      updatePlayer({
        id: editPlayerData.playerId ?? existing?.id ?? `g${selectedSeat}`,
        name: editPlayerData.name,
        icon: editPlayerData.icon ?? undefined,
        status: existing?.status ?? "active",
        stack: existing?.stack ?? 0,
        position: existing?.position ?? null,
        seat: selectedSeat,
      });
      setSelectedSeat(null);
    },
    [selectedSeat, input.players, updatePlayer],
  );

  const handleCancel = useCallback(() => {
    setSelectedSeat(null);
  }, []);

  const handleDelete = useCallback(() => {
    if (!selectedPlayer) return;
    deletePlayer(selectedPlayer.id);
    setSelectedSeat(null);
  }, [selectedPlayer, deletePlayer]);

  const startNextGame = useCallback(async () => {
    try {
      const response = await apiFetch("/api/board/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initializeBoardCommand),
      });

      if (!response.ok) {
        const msg = `HTTP error: ${response.status}`;
        toast.error(msg);
        console.error("[NextGameSetting] Failed to start game", msg);
        return;
      }

      const result = await response.json();
      if (result.type !== "success") {
        console.error("[NextGameSetting] Game start failed", result);
        toast.error("ゲームの開始に失敗しました");
        return;
      }
    } catch (error) {
      console.error("[NextGameSetting] Failed to start game", error);
      toast.error("ゲームの開始に失敗しました");
      return;
    }

    navigate("/game/playing");
  }, [initializeBoardCommand, navigate]);

  const settingHandlers: SettingHandlers = useMemo(
    () => ({
      chipInputModalTitle,
      chipInputValue,
      selectedButton,
      onSelectButton: handleSelectButton,
      onChipInputChange: setChipInputValue,
      onChipInputSave: handleChipInputSave,
      onAnteRuleToggle: handleAnteRuleToggle,
      onSettingButtonClick: handleClickAdvancedSetting,
      onBtnButtonClick: handleBtnButtonClick,
    }),
    [
      chipInputModalTitle,
      chipInputValue,
      selectedButton,
      handleSelectButton,
      handleChipInputSave,
      handleAnteRuleToggle,
      handleClickAdvancedSetting,
      handleBtnButtonClick,
    ],
  );

  const nextGameConfirmProps: NextGameConfirmProps = useMemo(
    () => ({
      onConfirmClick: startNextGame,
      disabled: !isStartable,
    }),
    [startNextGame, isStartable],
  );

  if (input.players.length === 0 && input.setting.name === "") {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <Page
      players={input.players}
      setting={input.setting}
      selectedSeat={selectedSeat}
      selectedPlayer={selectedPlayer}
      settingHandlers={settingHandlers}
      playerActionHandlers={{
        onClickSeat: handleClickSeat,
        onJoin: handleJoin,
        onCancel: handleCancel,
        onDelete: handleDelete,
      }}
      nextGameConfirmProps={nextGameConfirmProps}
      onHome={handleHome}
    />
  );
}
