import { useState } from "react";
import { RoundButton } from "../../../../../ui/button/round_button";
import { TextInput } from "../../../../../ui/text_input";

type AddModeProps = {
  mode: "add";
  seatIndex: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

type EditModeProps = {
  mode: "edit";
  seatIndex: number;
  currentName: string;
  onConfirm: (name: string) => void;
  onDelete: () => void;
  onCancel: () => void;
};

type Props = AddModeProps | EditModeProps;

export function PlayerModal(props: Props) {
  const { mode, seatIndex, onConfirm, onCancel } = props;
  const [name, setName] = useState(mode === "edit" ? props.currentName : "");

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex w-[360px] flex-col gap-4 rounded-xl bg-gray-900 p-8">
        <h2 className="text-center font-bold text-white text-xl">
          {mode === "add"
            ? `Seat ${seatIndex + 1} にプレイヤーを追加`
            : `Seat ${seatIndex + 1} を編集`}
        </h2>

        <label className="block">
          <span className="mb-1 block font-bold text-sm text-white">名前</span>
          <TextInput
            value={name}
            onChange={setName}
            placeholder="Player"
            onEnterPress={handleConfirm}
          />
        </label>

        <div className="flex flex-col gap-2">
          <RoundButton
            type="primary"
            size="full"
            text={mode === "add" ? "追加" : "保存"}
            disabled={name.trim().length === 0}
            onClick={handleConfirm}
          />
          {mode === "edit" && (
            <button
              type="button"
              onClick={props.onDelete}
              className="rounded-full border border-red-500 bg-transparent px-6 py-2 font-bold text-red-500 text-sm transition-colors hover:bg-red-500 hover:text-white"
            >
              削除
            </button>
          )}
          <RoundButton
            type="black"
            size="full"
            text="キャンセル"
            onClick={onCancel}
          />
        </div>
      </div>
    </div>
  );
}
