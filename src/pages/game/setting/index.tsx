import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../../api/client";
import { ChipInputModal } from "../../../features/modal/chip_input_modal";
import { useAutoScale } from "../../../hooks/useAutoScale";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import type { ChipSettingKey } from "./components/game_setting_buttons";
import { GameSettingButtons } from "./components/game_setting_buttons";
import { PlayerModal } from "./components/player_modal";
import { SettingBoard } from "./components/setting_board";

type Player = { name: string };

const CHIP_LABELS: Record<ChipSettingKey, string> = {
  smallBlind: "SB",
  bigBlind: "BB",
  minChip: "MINICHIP",
};

export function GameSetting() {
  const navigate = useNavigate();
  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  const [smallBlind, setSmallBlind] = useState(100);
  const [bigBlind, setBigBlind] = useState(200);
  const [minChip, setMinChip] = useState(100);
  const [bbAnte, setBbAnte] = useState(false);

  const [players, setPlayers] = useState<(Player | null)[]>(
    Array(9).fill(null),
  );

  const [selectedChipKey, setSelectedChipKey] = useState<ChipSettingKey | null>(
    null,
  );
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  // マウント時に永続化設定を読み込む
  useEffect(() => {
    api.gameSettings.load().then((s) => {
      setSmallBlind(s.smallBlind);
      setBigBlind(s.bigBlind);
      setMinChip(s.minChip);
      setBbAnte(s.bbAnte);
    });
  }, []);

  const saveSettings = (patch: {
    smallBlind?: number;
    bigBlind?: number;
    minChip?: number;
    bbAnte?: boolean;
  }) => {
    const next = {
      smallBlind: patch.smallBlind ?? smallBlind,
      bigBlind: patch.bigBlind ?? bigBlind,
      minChip: patch.minChip ?? minChip,
      bbAnte: patch.bbAnte ?? bbAnte,
    };
    api.gameSettings.save(next);
  };

  const filledPlayers = players.filter((p): p is Player => p !== null);
  const isStartable =
    filledPlayers.length >= 2 && smallBlind > 0 && bigBlind > 0;

  const handleClickSeat = (index: number) => {
    setSelectedSeat(index);
  };

  const handlePlayerAdd = (name: string) => {
    if (selectedSeat === null) return;
    setPlayers((prev) => {
      const next = [...prev];
      next[selectedSeat] = { name };
      return next;
    });
    setSelectedSeat(null);
  };

  const handlePlayerEdit = (name: string) => {
    if (selectedSeat === null) return;
    setPlayers((prev) => {
      const next = [...prev];
      next[selectedSeat] = { name };
      return next;
    });
    setSelectedSeat(null);
  };

  const handlePlayerDelete = () => {
    if (selectedSeat === null) return;
    setPlayers((prev) => {
      const next = [...prev];
      next[selectedSeat] = null;
      return next;
    });
    setSelectedSeat(null);
  };

  const getChipValue = (key: ChipSettingKey): number => {
    if (key === "smallBlind") return smallBlind;
    if (key === "bigBlind") return bigBlind;
    return minChip;
  };

  const validateChip =
    (key: ChipSettingKey) =>
    (value: number): string | null => {
      if (key === "minChip") {
        if (smallBlind % value !== 0 || bigBlind % value !== 0) {
          return "MINICHIP は SB と BB の公約数である必要があります";
        }
      }
      return null;
    };

  const handleChipConfirm = (value: number) => {
    if (!selectedChipKey) return;
    if (selectedChipKey === "smallBlind") {
      setSmallBlind(value);
      saveSettings({ smallBlind: value });
    } else if (selectedChipKey === "bigBlind") {
      setBigBlind(value);
      saveSettings({ bigBlind: value });
    } else {
      setMinChip(value);
      saveSettings({ minChip: value });
    }
    setSelectedChipKey(null);
  };

  const handleBbAnteToggle = () => {
    const next = !bbAnte;
    setBbAnte(next);
    saveSettings({ bbAnte: next });
  };

  const handleGameStart = () => {
    if (!isStartable) return;
    const playerNames = players
      .map((p) => p?.name ?? null)
      .filter((n): n is string => n !== null);

    navigate("/game/select-btn", {
      state: {
        smallBlind,
        bigBlind,
        minChip,
        bbAnte,
        playerNames,
      },
    });
  };

  const isSeatFilled = selectedSeat !== null && players[selectedSeat] !== null;

  return (
    <BasicPage>
      <div className="relative flex h-full w-full flex-col items-center justify-between gap-40 p-8">
        {/* ヘッダー */}
        <div className="flex h-20 w-full items-center justify-between">
          <RoundButton
            type="black"
            text="BACK"
            size="auto"
            onClick={() => navigate("/")}
          />
          <RoundButton
            type="black"
            text="RESET"
            size="auto"
            onClick={() => {
              setPlayers(Array(9).fill(null));
              setSmallBlind(100);
              setBigBlind(200);
              setMinChip(100);
              setBbAnte(false);
              api.gameSettings.save({
                smallBlind: 100,
                bigBlind: 200,
                minChip: 100,
                bbAnte: false,
              });
            }}
          />
        </div>

        {/* Board部分のみスケーリング、右寄りに配置してプレイヤーカードのはみ出しを考慮 (元実装と同じ構成) */}
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
              <SettingBoard players={players} onClickSeat={handleClickSeat} />
              <GameSettingButtons
                smallBlind={smallBlind}
                bigBlind={bigBlind}
                minChip={minChip}
                bbAnte={bbAnte}
                onSelectButton={setSelectedChipKey}
                onBbAnteToggle={handleBbAnteToggle}
              />
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="flex h-20 w-full items-center justify-end">
          <RoundButton
            type="primary"
            text="GAME START"
            size="auto"
            disabled={!isStartable}
            onClick={handleGameStart}
          />
        </div>
      </div>

      {/* チップ入力モーダル */}
      {selectedChipKey && (
        <ChipInputModal
          title={`${CHIP_LABELS[selectedChipKey]} を入力`}
          initialValue={getChipValue(selectedChipKey)}
          validate={validateChip(selectedChipKey)}
          onConfirm={handleChipConfirm}
          onCancel={() => setSelectedChipKey(null)}
        />
      )}

      {/* プレイヤーモーダル */}
      {selectedSeat !== null && !isSeatFilled && (
        <PlayerModal
          mode="add"
          seatIndex={selectedSeat}
          onConfirm={handlePlayerAdd}
          onCancel={() => setSelectedSeat(null)}
        />
      )}
      {selectedSeat !== null && isSeatFilled && (
        <PlayerModal
          mode="edit"
          seatIndex={selectedSeat}
          currentName={players[selectedSeat]?.name ?? ""}
          onConfirm={handlePlayerEdit}
          onDelete={handlePlayerDelete}
          onCancel={() => setSelectedSeat(null)}
        />
      )}
    </BasicPage>
  );
}
