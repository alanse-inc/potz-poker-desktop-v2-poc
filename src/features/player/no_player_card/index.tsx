import { PlayerIcon } from "../player_icon";

type Props = {
  onClick: () => void;
};

export function NoPlayerCard({ onClick }: Props) {
  return (
    <button
      className="relative flex cursor-pointer flex-col items-center justify-center p-2 opacity-50"
      onClick={onClick}
      type="button"
    >
      <div className="flex h-14 w-46 items-center rounded-xl border border-gray-500 bg-black pl-4">
        <p className="text-center font-bold text-gray-100 text-xs">NO PLAYER</p>
      </div>
      <div className="absolute -right-3 bottom-2">
        <PlayerIcon size="medium" playerIcon={null} bgColor="gray" />
      </div>
    </button>
  );
}
