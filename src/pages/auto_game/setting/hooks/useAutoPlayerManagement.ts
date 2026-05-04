import { useCallback, useState } from "react";
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

export function useAutoPlayerManagement() {
  const [players, setPlayers] = useState<AutoModePlayer[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const selectedPlayer = players.find((player) => player.seat === selectedSeat);

  const handleClickSeat = useCallback((seat: number) => {
    setSelectedSeat(seat);
  }, []);

  const handleJoin = useCallback(
    async (editPlayerData: EditPlayerData) => {
      if (!selectedSeat) {
        trackClientSideError("座席を選択してください");
        return;
      }

      let resolvedRawPlayerId: string;
      if (editPlayerData.playerId) {
        resolvedRawPlayerId = editPlayerData.playerId;
      } else {
        const next = pickNextAvailableGuestId(players);
        if (next === null) {
          trackClientSideError(
            "ゲストプレイヤー枠が全て埋まっています (最大10人)",
          );
          return;
        }
        resolvedRawPlayerId = next;
      }

      const newPlayer: AutoModePlayer = {
        id: resolvedRawPlayerId,
        name: editPlayerData.name ?? "",
        icon: editPlayerData.icon ?? null,
        position: selectedPlayer?.position ?? null,
        seat: selectedSeat,
        action: null,
        hand: [],
        odds: null,
      };

      setPlayers((prev) => {
        const existingIndex = prev.findIndex((p) => p.seat === selectedSeat);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newPlayer;
          return updated;
        }
        return [...prev, newPlayer];
      });

      setSelectedSeat(null);
    },
    [selectedSeat, selectedPlayer, players],
  );

  const handleCancel = useCallback(() => {
    setSelectedSeat(null);
  }, []);

  const handleDelete = useCallback(() => {
    if (!selectedPlayer) {
      trackClientSideError("削除するプレーヤーを選択してください");
      return;
    }

    setPlayers((prev) => prev.filter((p) => p.id !== selectedPlayer.id));
    setSelectedSeat(null);
  }, [selectedPlayer]);

  const handleSetBtnPosition = useCallback(
    (seat: number) => {
      const player = players.find((p) => p.seat === seat);
      if (!player) {
        trackClientSideError("プレーヤーが見つかりません");
        return;
      }

      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          position: p.seat === seat ? ("btn" as const) : null,
        })),
      );
    },
    [players],
  );

  const playerActionHandlers: PlayerActionHandlers = {
    onClickSeat: handleClickSeat,
    onJoin: handleJoin,
    onCancel: handleCancel,
    onDelete: handleDelete,
  };

  return {
    selectedSeat,
    selectedPlayer,
    playerActionHandlers,
    players,
    onSetBtnPosition: handleSetBtnPosition,
  };
}
