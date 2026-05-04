type Props = {
  seatIndex: number;
  name: string;
  stack: number;
  onClick: () => void;
};

export function PlayerCard({ seatIndex, name, stack, onClick }: Props) {
  return (
    <button
      type="button"
      className="relative flex cursor-pointer flex-col items-center justify-center p-2"
      onClick={onClick}
    >
      <div className="w-45">
        <div className="flex h-18 flex-col items-start justify-start rounded-t-xl border-x-3 border-t-3 bg-gray-900 px-3 pt-1 font-bold text-white text-xs">
          <div>Seat {seatIndex + 1}</div>
          <div>{name || "NO NAME"}</div>
          <div>{stack.toLocaleString()}</div>
        </div>
        <div className="h-7 rounded-b-xl border-3 border-white bg-white px-3 text-left font-bold text-gray-900 text-xs" />
      </div>
    </button>
  );
}
