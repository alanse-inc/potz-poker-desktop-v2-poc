import type {
  ManualModeInitializeBoardCommand,
  PlayerSeatRange,
} from "../../../../contexts/initialize_board_command_context";
import { AutoModePlayerEditModal } from "../../../../features/modal/auto_mode_player_edit_modal";
import { ChipInputModal } from "../../../../features/modal/chip_input_modal";
import { useAutoScale } from "../../../../hooks/useAutoScale";
import { RoundButton } from "../../../../ui/button/round_button";
import { BasicPage } from "../../../../ui/page/basic";
import { SettingBoard } from "./components/board";
import { GameSettingButtons } from "./components/game_setting_buttons";
import type {
  NextGameConfirmProps,
  PlayerActionHandlers,
  SettingHandlers,
} from "./types";

type Player = ManualModeInitializeBoardCommand["input"]["players"][number];

type Props = {
  players: Player[];
  setting: ManualModeInitializeBoardCommand["input"]["setting"];
  selectedSeat: PlayerSeatRange | null;
  selectedPlayer?: Player;
  settingHandlers: SettingHandlers;
  playerActionHandlers: PlayerActionHandlers;
  nextGameConfirmProps: NextGameConfirmProps;
  onNavigateToCheckIn?: () => void;
  onHome: () => void;
};

export function Page({
  players,
  setting,
  selectedSeat,
  selectedPlayer,
  settingHandlers,
  playerActionHandlers,
  nextGameConfirmProps,
  onNavigateToCheckIn,
  onHome,
}: Props) {
  const {
    chipInputModalTitle,
    chipInputValue,
    selectedButton,
    onChipInputChange: _onChipInputChange,
    onSelectButton,
    onBtnButtonClick,
    onAnteRuleToggle,
    onChipInputSave,
  } = settingHandlers;

  const { onClickSeat, onJoin, onCancel, onDelete } = playerActionHandlers;

  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  return (
    <BasicPage>
      <div className="relative flex h-full w-full flex-col items-center justify-between gap-40 p-8">
        <div className="flex h-20 w-full items-center justify-between">
          <RoundButton type="black" text="HOME" size="small" onClick={onHome} />
          <div className="flex items-center gap-8">
            <RoundButton
              type="primary"
              text="NEXT GAME"
              size="auto"
              onClick={nextGameConfirmProps.onConfirmClick}
              disabled={nextGameConfirmProps.disabled}
            />
          </div>
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
                gameName={setting.name}
                onClickSeat={onClickSeat}
                onNavigateToCheckIn={onNavigateToCheckIn}
              />
              <GameSettingButtons
                setting={setting}
                onSelectButton={onSelectButton}
                onBtnButtonClick={onBtnButtonClick}
                onAnteRuleToggle={onAnteRuleToggle}
              />
            </div>
          </div>
        </div>
        {selectedSeat && (
          <AutoModePlayerEditModal
            playerId={selectedPlayer?.id}
            name={selectedPlayer?.name}
            icon={selectedPlayer?.icon ?? null}
            onJoin={onJoin}
            onCancel={onCancel}
            onDelete={onDelete}
          />
        )}
        {selectedButton && (
          <ChipInputModal
            title={chipInputModalTitle}
            initialValue={chipInputValue}
            onConfirm={onChipInputSave}
            onCancel={() => onSelectButton(null)}
          />
        )}
        <div className="flex h-20 w-full items-center justify-end gap-6" />
      </div>
    </BasicPage>
  );
}
