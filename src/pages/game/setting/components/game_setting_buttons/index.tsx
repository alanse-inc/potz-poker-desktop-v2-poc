import { SquareButton } from "../../../../../ui/button/square_button";

export type ChipSettingKey = "smallBlind" | "bigBlind" | "minChip";

type Props = {
  smallBlind: number;
  bigBlind: number;
  minChip: number;
  bbAnte: boolean;
  onSelectButton: (key: ChipSettingKey) => void;
  onBbAnteToggle: () => void;
};

export function GameSettingButtons({
  smallBlind,
  bigBlind,
  minChip,
  bbAnte,
  onSelectButton,
  onBbAnteToggle,
}: Props) {
  return (
    <div className="grid h-80 w-62 grid-cols-2 grid-rows-3 place-items-center">
      <SquareButton
        type="black"
        text={["SB", smallBlind.toString()]}
        onClick={() => onSelectButton("smallBlind")}
      />
      <SquareButton
        type="black"
        text={["BB", bigBlind.toString()]}
        onClick={() => onSelectButton("bigBlind")}
      />
      <SquareButton
        type="black"
        text={["MINICHIP", minChip.toString()]}
        onClick={() => onSelectButton("minChip")}
      />
      <SquareButton
        type={bbAnte ? "light-gray" : "black"}
        text={["BBANTE", bbAnte ? "ON" : "OFF"]}
        onClick={onBbAnteToggle}
      />
    </div>
  );
}
