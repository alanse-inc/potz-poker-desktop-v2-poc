import { AutoModePlayerEditModal } from "../../../features/modal/auto_mode_player_edit_modal";
import { useAutoScale } from "../../../hooks/useAutoScale";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import { Switch } from "../../../ui/switch";
import { AutoGameSettingButtons } from "./components/game_setting_buttons";
import { SettingBoard } from "./components/setting_board";
import { useAutoGameSetting } from "./hooks/useAutoGameSetting";
import { usePlayerActions } from "./hooks/usePlayerActions";

export function AutoGameSetting() {
  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  const {
    players,
    setting,
    isStartable,
    onChangeGameMode,
    handleBtnButtonClick,
    handleGameStart,
  } = useAutoGameSetting();

  const { selectedSeat, selectedPlayer, playerActionHandlers } =
    usePlayerActions();

  return (
    <BasicPage>
      <div className="relative flex h-full w-full flex-col items-center justify-between gap-40 p-8">
        <div className="flex h-20 w-full items-center justify-end">
          <Switch
            text="AUTO MODE"
            checked={true}
            disabled={false}
            onChange={onChangeGameMode}
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
                players={players.map((p) => ({
                  id: p.id,
                  name: p.name,
                  icon: p.icon ?? null,
                  seat: p.seat,
                  position: p.position,
                  action: null,
                  hand: [],
                  odds: null,
                }))}
                gameName={setting.name}
                onClickSeat={playerActionHandlers.onClickSeat}
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
            onJoin={playerActionHandlers.onJoin}
            onCancel={playerActionHandlers.onCancel}
            onDelete={playerActionHandlers.onDelete}
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
