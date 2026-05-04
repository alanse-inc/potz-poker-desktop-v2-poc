import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../../../../api/client";
import { RoundButton } from "../../../../../ui/button/round_button";
import { TextInput } from "../../../../../ui/text_input";

type Props = {
  defaultName: string;
  onClose: () => void;
  onAdded: () => void;
};

export function AddPlayerModal({ defaultName, onClose, onAdded }: Props) {
  const [name, setName] = useState(defaultName);
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("プレイヤー名を入力してください");
      return;
    }
    setIsSaving(true);
    try {
      await api.board.addPlayer(trimmed);
      onAdded();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex w-[400px] flex-col gap-4 rounded-xl bg-gray-900 p-8">
        <h2 className="text-center font-bold text-white text-xl">
          プレイヤー追加
        </h2>
        <p className="text-center text-gray-300 text-xs">
          現在のバイインでスタックが付与されます
        </p>

        <label className="block">
          <span className="mb-1 block font-bold text-sm text-white">名前</span>
          <TextInput value={name} onChange={setName} placeholder="Player" />
        </label>

        <div className="flex flex-col gap-2">
          <RoundButton
            type="primary"
            size="full"
            text={isSaving ? "追加中..." : "追加"}
            disabled={isSaving}
            onClick={handleAdd}
          />
          <RoundButton
            type="black"
            size="full"
            text="キャンセル"
            onClick={onClose}
          />
        </div>
      </div>
    </div>
  );
}
