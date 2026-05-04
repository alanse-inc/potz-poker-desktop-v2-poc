/**
 * Auto Game BTN 選択画面
 *
 * Electron 版の pages/auto_game/select_btn を Tauri 版に移植
 */

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import type { AutoModePlayer } from "../../../domain/auto_game/types";
import { useAutoScale } from "../../../hooks/useAutoScale";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import { AutoGameSettingButtons } from "../setting/components/game_setting_buttons";
import { SettingBoard } from "../setting/components/setting_board";

type LocationState = {
  players: AutoModePlayer[];
  gameName: string;
};

export function AutoGameSelectBtn() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  useEffect(() => {
    if (!state) {
      navigate("/auto-game/setting", { replace: true });
    }
  }, [state, navigate]);

  if (!state) return null;

  const { players, gameName } = state;

  const handleSelectSeat = (seat: number) => {
    const player = players.find((p) => p.seat === seat);
    if (!player) return;

    navigate("/auto-game/setting", {
      state: { selectedBtnSeat: seat },
      replace: true,
    });
  };

  const handleBack = () => {
    navigate("/auto-game/setting");
  };

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
              <SettingBoard
                players={players}
                gameName={gameName}
                onClickSeat={handleSelectSeat}
              />
              <AutoGameSettingButtons onBtnButtonClick={() => {}} disabled />
            </div>
          </div>
        </div>

        <div className="flex h-20 w-full items-center justify-end">
          <RoundButton
            text="BACK"
            type="dark-gray"
            size="small"
            onClick={handleBack}
          />
        </div>
      </div>
    </BasicPage>
  );
}
