import { SquareButton } from "../../../../../../ui/button/square_button";
import type { ChipSettingKey } from "../../types";

type Setting = {
  smallBlind: number;
  bigBlind: number;
  miniChip: number;
  anteRule: "none" | "bbante";
};

type Props = {
  setting: Setting;
  onSelectButton: (button: ChipSettingKey | null) => void;
  onBtnButtonClick: () => void;
  onAnteRuleToggle: () => void;
  disabled?: boolean;
};

export function GameSettingButtons({
  setting,
  onSelectButton,
  onBtnButtonClick,
  onAnteRuleToggle,
  disabled,
}: Props) {
  return (
    <div className="grid h-80 w-62 grid-cols-2 grid-rows-3 place-items-center">
      <SquareButton
        type="black"
        text={["SB", setting.smallBlind.toString()]}
        onClick={() => onSelectButton("smallBlind")}
        disabled={disabled}
      />
      <SquareButton
        type="black"
        text={["BB", setting.bigBlind.toString()]}
        onClick={() => onSelectButton("bigBlind")}
        disabled={disabled}
      />
      <SquareButton
        type="black"
        text={["MINICHIP", setting.miniChip.toString()]}
        onClick={() => onSelectButton("miniChip")}
        disabled={disabled}
      />
      <SquareButton
        type="black"
        text={["BTN"]}
        onClick={onBtnButtonClick}
        disabled={disabled}
      />
      <SquareButton
        type={setting.anteRule === "bbante" ? "light-gray" : "black"}
        text={["BBANTE", setting.anteRule === "bbante" ? "ON" : "OFF"]}
        onClick={onAnteRuleToggle}
        disabled={disabled}
      />
    </div>
  );
}
