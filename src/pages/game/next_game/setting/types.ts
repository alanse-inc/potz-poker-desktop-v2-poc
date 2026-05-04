import type { PlayerSeatRange } from "../../../../contexts/initialize_board_command_context";
import type { EditPlayerData } from "../../../../features/modal/auto_mode_player_edit_modal";

export type ChipSettingKey = "smallBlind" | "bigBlind" | "miniChip";

export type SettingHandlers = {
  chipInputModalTitle: string;
  chipInputValue: number;
  selectedButton: ChipSettingKey | null;
  onSelectButton: (key: ChipSettingKey | null) => void;
  onChipInputChange: (value: number) => void;
  onAnteRuleToggle: () => void;
  onSettingButtonClick: () => void;
  onChipInputSave: (value: number) => void;
  onBtnButtonClick: () => void;
};

export type PlayerActionHandlers = {
  onClickSeat: (seat: PlayerSeatRange) => void;
  onJoin: (editPlayerData: EditPlayerData) => void;
  onCancel: () => void;
  onDelete: () => void;
};

export type NextGameConfirmProps = {
  onConfirmClick: () => void;
  disabled?: boolean;
};
