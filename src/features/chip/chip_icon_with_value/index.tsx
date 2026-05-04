import ChipSVG from "../chip.svg";
import { formatChipWithSuffix } from "../format_chip_with_suffix";

type Props = {
  value: number;
};

export const ChipIconWithValue = ({ value }: Props) => {
  const formattedValue = formatChipWithSuffix(value);

  return (
    <div className="flex h-[16px] w-auto items-center">
      <img src={ChipSVG} alt="チップアイコン" />
      <p className="text-white text-xs">{formattedValue}</p>
    </div>
  );
};
