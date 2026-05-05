import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../../api/client";
import type { Player } from "../../../types";
import { RoundButton } from "../../../ui/button/round_button";
import { TextInput } from "../../../ui/text_input";

type Props = {
  player: Player;
  isShowdown: boolean;
  canRemove: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

export function PlayerEditModal({
  player,
  isShowdown,
  canRemove,
  onClose,
  onUpdated,
}: Props) {
  const [name, setName] = useState(player.name);
  const [stack, setStack] = useState(player.stack.toString());
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("プレイヤー名を入力してください");
      return;
    }
    const stackNum = Number(stack);
    if (
      !Number.isFinite(stackNum) ||
      !Number.isInteger(stackNum) ||
      stackNum < 0
    ) {
      toast.error("スタックは 0 以上の整数を入力してください");
      return;
    }
    if (stackNum > 10_000_000) {
      toast.error("スタックは 10,000,000 以下の値を入力してください");
      return;
    }
    setIsSaving(true);
    try {
      await api.board.updatePlayer({
        position: player.position,
        name: trimmedName,
        stack: stackNum,
      });
      onUpdated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    try {
      await api.board.removePlayer(player.position);
      onUpdated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex w-[400px] flex-col gap-4 rounded-xl bg-gray-900 p-8">
        <h2 className="text-center font-bold text-white text-xl">
          プレイヤー編集 (Seat {player.position + 1})
        </h2>

        <label className="block">
          <span className="mb-1 block font-bold text-sm text-white">名前</span>
          <TextInput value={name} onChange={setName} placeholder="Player" />
        </label>

        <label className="block">
          <span className="mb-1 block font-bold text-sm text-white">
            スタック
          </span>
          <TextInput value={stack} onChange={setStack} placeholder="10000" />
        </label>

        <div className="flex flex-col gap-2">
          <RoundButton
            type="primary"
            size="full"
            text={isSaving ? "更新中..." : "保存"}
            disabled={isSaving}
            onClick={handleSave}
          />
          {canRemove && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isSaving || !isShowdown}
              className="rounded-full border border-red-500 bg-transparent px-6 py-2 font-bold text-red-500 text-sm transition-colors hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isShowdown
                ? "このプレイヤーを削除"
                : "削除は SHOWDOWN 時のみ可能"}
            </button>
          )}
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
