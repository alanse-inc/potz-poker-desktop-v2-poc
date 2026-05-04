import { SquareButton } from "../../../../../../ui/button/square_button";

export type ChipSettingKey = "smallBlind" | "bigBlind" | "minChip";

type Props = {
  smallBlind: number;
  bigBlind: number;
  minChip: number;
  bbAnte: boolean;
  onSelectButton: (key: ChipSettingKey) => void;
  onBbAnteToggle: () => void;
  /** BTN 選択ボタンを押した時 */
  onBtnButtonClick: () => void;
  disabled?: boolean;
};

export function GameSettingButtons({
  smallBlind,
  bigBlind,
  minChip,
  bbAnte,
  onSelectButton,
  onBbAnteToggle,
  onBtnButtonClick,
  disabled,
}: Props) {
  return (
    <div className="grid h-80 w-62 grid-cols-2 grid-rows-3 place-items-center">
      <SquareButton
        type="black"
        text={["SB", smallBlind.toString()]}
        onClick={() => onSelectButton("smallBlind")}
        disabled={disabled}
      />
      <SquareButton
        type="black"
        text={["BB", bigBlind.toString()]}
        onClick={() => onSelectButton("bigBlind")}
        disabled={disabled}
      />
      <SquareButton
        type="black"
        text={["MINICHIP", minChip.toString()]}
        onClick={() => onSelectButton("minChip")}
        disabled={disabled}
      />
      <SquareButton
        type="black"
        text={["BTN"]}
        onClick={onBtnButtonClick}
        disabled={disabled}
      />
      <SquareButton
        type={bbAnte ? "light-gray" : "black"}
        text={["BBANTE", bbAnte ? "ON" : "OFF"]}
        onClick={onBbAnteToggle}
        disabled={disabled}
      />
    </div>
  );
}
