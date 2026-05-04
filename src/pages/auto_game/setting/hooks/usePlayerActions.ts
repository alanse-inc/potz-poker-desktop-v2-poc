import { useMemo, useState } from "react";
import { useAutoModeInitializeBoardCommand } from "../../../../contexts/auto_mode_initialize_board_command_context";
import type { AutoModePlayer } from "../../../../domain/auto_game/types";
import { pickNextAvailableGuestId } from "../../../../domain/guest_player";
import { trackClientSideError } from "../../../../features/error_tracker";
import type { EditPlayerData } from "../../../../features/modal/auto_mode_player_edit_modal";

type PlayerActionHandlers = {
  onClickSeat: (seat: number) => void;
  onJoin: (editPlayerData: EditPlayerData) => Promise<void>;
  onCancel: () => void;
  onDelete: () => void;
};

export function usePlayerActions() {
  const { initializeBoardCommand, updatePlayer, deletePlayer } =
    useAutoModeInitializeBoardCommand();

  const players = initializeBoardCommand.input.players;

  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const selectedPlayer = useMemo<AutoModePlayer | undefined>(() => {
    if (!selectedSeat) return undefined;
    const p = players.find((p) => p.seat === selectedSeat);
    if (!p) return undefined;
    return {
      id: p.id,
      name: p.name,
      icon: p.icon ?? null,
      seat: p.seat,
      position: p.position,
      action: null,
      hand: [],
      odds: null,
    };
  }, [selectedSeat, players]);

  const playerActionHandlers: PlayerActionHandlers = useMemo(
    () => ({
      onClickSeat: (seat: number) => {
        setSelectedSeat(seat);
      },
      onJoin: async (editPlayerData: EditPlayerData) => {
        if (!selectedSeat) return;
        if (!editPlayerData.name) return;

        let playerId: string;
        if (editPlayerData.playerId) {
          playerId = editPlayerData.playerId;
        } else {
          const next = pickNextAvailableGuestId(players);
          if (next === null) {
            trackClientSideError(
              "ゲストプレイヤー枠が全て埋まっています (最大10人)",
            );
            return;
          }
          playerId = next;
        }

        await updatePlayer({
          id: playerId,
          name: editPlayerData.name,
          ...(editPlayerData.icon ? { icon: editPlayerData.icon } : {}),
          position: null,
          seat: selectedSeat as Parameters<typeof updatePlayer>[0]["seat"],
        });
        setSelectedSeat(null);
      },
      onCancel: () => {
        setSelectedSeat(null);
      },
      onDelete: () => {
        if (!selectedPlayer) return;
        deletePlayer(selectedPlayer.id);
        setSelectedSeat(null);
      },
    }),
    [selectedSeat, selectedPlayer, updatePlayer, deletePlayer, players],
  );

  return {
    selectedSeat,
    selectedPlayer,
    playerActionHandlers,
  };
}
