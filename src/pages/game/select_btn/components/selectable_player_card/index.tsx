import { SmallReverseCard } from "../../../../../features/card/reverse/small_size";
import { formatChipWithSuffix } from "../../../../../features/chip/format_chip_with_suffix";
import { PlayerIcon } from "../../../../../features/player/player_icon";

type Props = {
  seatNumber: number;
  name: string;
  initialStack: number;
  highlight: boolean;
  onPress: () => void;
};

export function SelectablePlayerCard({
  seatNumber,
  name,
  initialStack,
  highlight,
  onPress,
}: Props) {
  const borderTopClass = highlight ? "border-primary" : "border-gray-800";
  const borderBottomClass = highlight ? "border-primary" : "border-white";
  const badgeBg = highlight ? "bg-primary" : "bg-white";
  const badgeText = highlight ? "text-black" : "text-gray-900";

  return (
    <button
      type="button"
      className="relative flex cursor-pointer flex-col items-center justify-center p-2"
      onClick={onPress}
    >
      <div className="w-45">
        <div
          className={`flex h-18 flex-col items-start justify-start rounded-t-xl border-x-3 border-t-3 bg-gray-900 px-3 pt-1 font-bold text-white text-xs ${borderTopClass}`}
        >
          <div>Seat {seatNumber}</div>
          <div>{name || "NO NAME"}</div>
          <div>{formatChipWithSuffix(initialStack)}</div>
        </div>
        <div
          className={`h-7 rounded-b-xl border-3 px-3 text-left font-bold text-xs ${badgeBg} ${badgeText} ${borderBottomClass}`}
        >
          {highlight ? "BTN" : ""}
        </div>
        <div className="absolute top-[60px] right-[-5px] z-1 flex flex-row">
          <div className="translate-x-1 rotate-[-15deg] transform brightness-50 filter">
            <SmallReverseCard />
          </div>
          <div className="rotate-[15deg] transform brightness-50 filter">
            <SmallReverseCard />
          </div>
        </div>
        <div className="absolute top-[16px] right-[-20px]">
          <PlayerIcon
            bgColor="gray"
            playerIcon={null}
            highlight={highlight}
            size="medium"
          />
        </div>
      </div>
    </button>
  );
}
