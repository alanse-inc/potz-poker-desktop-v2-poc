/**
 * Auto Game 設定画面
 *
 * Electron 版の pages/auto_game/setting を Tauri 版に移植
 * - プレイヤーの追加・編集・削除
 * - BTN プレイヤーの選択 (select-btn ページへ遷移)
 * - GAME START でプレイ画面へ遷移
 */

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router";
import { useAutoBoard } from "../../../contexts/auto_board_context";
import {
  assignPositions,
  initializePlayers,
} from "../../../domain/auto_game/player";
import type {
  AutoModeGameSetting,
  AutoModePlayer,
} from "../../../domain/auto_game/types";
import type { EditPlayerData } from "../../../features/modal/auto_mode_player_edit_modal";
import { AutoModePlayerEditModal } from "../../../features/modal/auto_mode_player_edit_modal";
import { useAutoScale } from "../../../hooks/useAutoScale";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import { Switch } from "../../../ui/switch";
import { AutoGameSettingButtons } from "./components/game_setting_buttons";
import { SettingBoard } from "./components/setting_board";

/**
 * ゲスト ID 生成 (g1〜g9)
 */
function pickNextGuestId(players: AutoModePlayer[]): string | null {
  for (let i = 1; i <= 9; i++) {
    const id = `g${i}`;
    if (!players.find((p) => p.id === id)) return id;
  }
  return null;
}

export function AutoGameSetting() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setBoard } = useAutoBoard();

  // プレイヤー状態
  const [players, setPlayers] = useState<AutoModePlayer[]>([]);
  const gameName = "AUTO GAME";
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  // select-btn ページから戻ってきたときのハンドリング
  const state = location.state as { selectedBtnSeat?: number } | null;
  if (state?.selectedBtnSeat) {
    // BTN プレイヤーのポジションを更新
    const btnSeat = state.selectedBtnSeat;
    const btnPlayer = players.find((p) => p.seat === btnSeat);
    if (btnPlayer) {
      const updated = assignPositions(players, btnPlayer.id);
      setPlayers(updated);
    }
    // state をクリア
    navigate("/auto-game/setting", { replace: true, state: {} });
  }

  const selectedPlayer = useMemo(
    () =>
      selectedSeat !== null
        ? players.find((p) => p.seat === selectedSeat)
        : undefined,
    [selectedSeat, players],
  );

  // ゲーム開始可能かどうか (BTN プレイヤーがいる & 2 人以上)
  const isStartable = useMemo(() => {
    if (players.length < 2) return false;
    return players.some((p) => p.position === "btn" || p.position === "btn_sb");
  }, [players]);

  const setting: AutoModeGameSetting = { name: gameName };

  const handleClickSeat = (seat: number) => {
    setSelectedSeat(seat);
  };

  const handleJoin = (data: EditPlayerData) => {
    const { name, icon, playerId } = data;
    if (!name || selectedSeat === null) return;

    setPlayers((prev) => {
      const existingIndex = prev.findIndex((p) => p.seat === selectedSeat);

      if (existingIndex !== -1) {
        // 既存プレイヤーの更新
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          name,
          icon: icon ?? null,
          ...(playerId ? { id: playerId } : {}),
        };
        return updated;
      }

      // 新規プレイヤーの追加
      const id = playerId ?? pickNextGuestId(prev);
      if (!id) {
        toast.error("プレイヤーを追加できません (最大 9 人)");
        return prev;
      }

      const newPlayer: AutoModePlayer = {
        id,
        name,
        icon: icon ?? null,
        seat: selectedSeat,
        position: null,
        action: null,
        hand: [],
        odds: null,
      };
      return [...prev, newPlayer];
    });

    setSelectedSeat(null);
  };

  const handleDelete = () => {
    if (!selectedPlayer) return;
    setPlayers((prev) => {
      const filtered = prev.filter((p) => p.id !== selectedPlayer.id);
      // ポジションをリセット
      return filtered.map((p) => ({ ...p, position: null }));
    });
    setSelectedSeat(null);
  };

  const handleCancel = () => {
    setSelectedSeat(null);
  };

  const handleBtnButtonClick = () => {
    navigate("/auto-game/select-btn", {
      state: { players, gameName },
    });
  };

  const handleGameStart = () => {
    if (!isStartable) return;

    const btnPlayer = players.find(
      (p) => p.position === "btn" || p.position === "btn_sb",
    );
    if (!btnPlayer) {
      toast.error("BTN プレイヤーが設定されていません");
      return;
    }

    // ポジションを確定して初期ゲームボードを作成
    const initializedPlayers = initializePlayers(
      players.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon,
        seat: p.seat,
      })),
    );
    const playersWithPositions = assignPositions(
      initializedPlayers,
      btnPlayer.id,
    );

    setBoard({
      setting,
      players: playersWithPositions,
      communityCards: [],
      burnCards: [],
      handNumber: 1,
      winners: null,
    });

    navigate("/auto-game/playing");
  };

  const handleChangeGameMode = () => {
    navigate("/game/first-game/setting");
  };

  return (
    <BasicPage>
      <div className="relative flex h-full w-full flex-col items-center justify-between gap-40 p-8">
        <div className="flex h-20 w-full items-center justify-end">
          <Switch
            text="AUTO MODE"
            checked={true}
            disabled={false}
            onChange={handleChangeGameMode}
          />
        </div>

        <div
          ref={containerRef}
          className="relative flex w-full flex-1 items-center justify-center"
        >
          <div
            ref={contentRef}
            className="absolute"
            style={{ width: "950px", height: "400px" }}
          >
            <div className="flex h-full items-center gap-60 pl-16">
              <SettingBoard
                players={players}
                gameName={gameName}
                onClickSeat={handleClickSeat}
              />
              <AutoGameSettingButtons onBtnButtonClick={handleBtnButtonClick} />
            </div>
          </div>
        </div>

        {selectedSeat !== null && (
          <AutoModePlayerEditModal
            playerId={selectedPlayer?.id}
            name={selectedPlayer?.name}
            icon={selectedPlayer?.icon ?? null}
            onJoin={handleJoin}
            onCancel={handleCancel}
            onDelete={handleDelete}
          />
        )}

        <div className="flex h-20 w-full items-center justify-end gap-6">
          <RoundButton
            text="GAME START"
            type="primary"
            size="auto"
            onClick={handleGameStart}
            disabled={!isStartable}
          />
        </div>
      </div>
    </BasicPage>
  );
}
