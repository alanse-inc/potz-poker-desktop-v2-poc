import { useState } from "react";
import { RoundButton } from "../../../../../ui/button/round_button";

type Props = {
  title: string;
  initialValue: number;
  validate?: (value: number) => string | null;
  onConfirm: (value: number) => void;
  onCancel: () => void;
};

export function ChipInputModal({
  title,
  initialValue,
  validate,
  onConfirm,
  onCancel,
}: Props) {
  const [input, setInput] = useState(initialValue.toString());

  const numeric = Number(input);
  const isNotPositive = !Number.isFinite(numeric) || numeric <= 0;
  const validationError = !isNotPositive && validate ? validate(numeric) : null;
  const isInvalid = isNotPositive || validationError !== null;

  const handleConfirm = () => {
    if (isInvalid) return;
    onConfirm(numeric);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex w-[360px] flex-col gap-4 rounded-xl bg-gray-900 p-8">
        <h2 className="text-center font-bold text-white text-xl">{title}</h2>

        <input
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="h-14 w-full rounded-full border border-black bg-black-darkest px-6 text-center font-bold text-lg text-white"
        />

        {validationError && (
          <p className="text-center text-red-400 text-xs">{validationError}</p>
        )}

        <div className="flex flex-col gap-2">
          <RoundButton
            type="primary"
            size="full"
            text="決定"
            disabled={isInvalid}
            onClick={handleConfirm}
          />
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
