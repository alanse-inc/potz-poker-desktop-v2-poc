import { produce } from "immer";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Board,
  type BoardProps,
  type SeatContent,
} from "../../../../features/board";
import { DealerIcon } from "../../../../features/dealer_icon";
import { useAutoScale } from "../../../../hooks/useAutoScale";
import { RoundButton } from "../../../../ui/button/round_button";
import { BasicPage } from "../../../../ui/page/basic";
import { GameSettingButtons } from "../setting/components/game_setting_buttons";

type Player = { name: string; stack: number; isDealer: boolean };

type LocationState = {
  smallBlind: number;
  bigBlind: number;
  minChip: number;
  bbAnte: boolean;
  players: (Player | null)[];
};

const EMPTY_SEATS: BoardProps["seats"] = {
  1: { playerCard: undefined },
  2: { playerCard: undefined },
  3: { playerCard: undefined },
  4: { playerCard: undefined },
  5: { playerCard: undefined },
  6: { playerCard: undefined },
  7: { playerCard: undefined },
  8: { playerCard: undefined },
  9: { playerCard: undefined },
  10: { playerCard: undefined },
};

export function FirstGameSelectBtn() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  useEffect(() => {
    if (!state) {
      navigate("/game/first-game/setting", { replace: true });
    }
  }, [state, navigate]);

  if (!state) return null;

  const { smallBlind, bigBlind, minChip, bbAnte, players } = state;

  const handleSelectBtn = (index: number) => {
    const player = players[index];
    if (!player) return;
    setSelectedIndex(index);
  };

  const handleConfirm = () => {
    if (selectedIndex === null) return;
    // 選択された BTN を設定した状態で setting 画面に戻る
    const updatedPlayers = players.map((p, i) =>
      p ? { ...p, isDealer: i === selectedIndex } : null,
    );
    navigate("/game/first-game/setting", {
      state: {
        smallBlind,
        bigBlind,
        minChip,
        bbAnte,
        players: updatedPlayers,
      },
      replace: true,
    });
  };

  const seats = produce(EMPTY_SEATS, (draft) => {
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      if (!player) continue;
      const seat = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
      const isSelected = selectedIndex === i;
      const seatContent: SeatContent = {
        playerCard: (
          <button
            key={seat}
            type="button"
            className={`relative flex cursor-pointer flex-col items-center justify-center p-2 ${isSelected ? "opacity-100" : "opacity-70"}`}
            onClick={() => handleSelectBtn(i)}
          >
            <div className="w-45">
              <div
                className={`flex h-18 flex-col items-start justify-start rounded-t-xl border-x-3 border-t-3 bg-gray-900 px-3 pt-1 font-bold text-white text-xs ${isSelected ? "border-primary" : "border-gray-600"}`}
              >
                <div>Seat {i + 1}</div>
                <div>{player.name || "NO NAME"}</div>
                <div>{player.stack.toLocaleString()}</div>
              </div>
              <div
                className={`h-7 rounded-b-xl border-3 px-3 text-left font-bold text-xs ${isSelected ? "border-primary bg-primary text-black" : "border-white bg-white text-gray-900"}`}
              />
            </div>
          </button>
        ),
        otherItem: isSelected ? <DealerIcon /> : undefined,
      };
      draft[seat] = seatContent;
    }
  });

  const centerContent = (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="font-bold text-primary text-sm">BTNを選択してください</p>
      <p className="text-gray-300 text-xs">プレイヤーをタップして選択</p>
    </div>
  );

  return (
    <BasicPage>
      <div className="relative flex h-full w-full flex-col items-center justify-between gap-40 p-8">
        <div className="flex h-20 w-full items-center justify-center">
          <h1 className="font-bold text-2xl text-primary">
            BTNを選択してください
          </h1>
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
              <Board seats={seats} centerContent={centerContent} />
              <GameSettingButtons
                smallBlind={smallBlind}
                bigBlind={bigBlind}
                minChip={minChip}
                bbAnte={bbAnte}
                onSelectButton={() => {}}
                onBbAnteToggle={() => {}}
                onBtnButtonClick={() => {}}
                disabled
              />
            </div>
          </div>
        </div>

        <div className="flex h-20 w-full items-center justify-between">
          <RoundButton
            text="BACK"
            type="dark-gray"
            size="small"
            onClick={() => navigate(-1)}
          />
          <RoundButton
            text="確定"
            type="primary"
            size="small"
            disabled={selectedIndex === null}
            onClick={handleConfirm}
          />
        </div>
      </div>
    </BasicPage>
  );
}
