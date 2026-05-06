import { useEffect, useMemo, useState } from "react";
import { RoundButton } from "../../../../../ui/button/round_button";

type Props = {
  type: "BET" | "RAISE";
  minAmount: number;
  maxAmount: number;
  bigBlind: number;
  minChip?: number;
  potAmount?: number;
  onCancel: () => void;
  onConfirm: (amount: number) => void;
};

export function BetAmountModal({
  type,
  minAmount,
  maxAmount,
  bigBlind,
  minChip,
  potAmount,
  onCancel,
  onConfirm,
}: Props) {
  const initial = useMemo(() => {
    const roundToMinChip = (v: number) =>
      minChip && minChip > 0 ? Math.round(v / minChip) * minChip : v;
    const candidate = Math.max(minAmount, roundToMinChip(bigBlind * 2));
    return Math.min(candidate, maxAmount);
  }, [minAmount, maxAmount, bigBlind, minChip]);

  const [value, setValue] = useState<string>(initial.toString());

  useEffect(() => {
    setValue(initial.toString());
  }, [initial]);

  const numeric = Number(value);
  const isInvalid =
    !Number.isInteger(numeric) ||
    numeric < minAmount ||
    numeric > maxAmount ||
    numeric <= 0;

  const presets = useMemo(() => {
    const roundToMinChip = (v: number) =>
      minChip && minChip > 0 ? Math.round(v / minChip) * minChip : v;
    const items = [
      { label: "MIN", value: minAmount },
      { label: "2BB", value: roundToMinChip(bigBlind * 2) },
      { label: "3BB", value: roundToMinChip(bigBlind * 3) },
      ...(potAmount !== undefined &&
      potAmount >= minAmount &&
      potAmount <= maxAmount
        ? [{ label: "POT", value: potAmount }]
        : []),
    ];
    const clamped = items
      .map((p) => ({
        ...p,
        value: Math.min(Math.max(p.value, minAmount), maxAmount),
      }))
      .filter((p) => p.value > 0);
    const seen = new Set<number>();
    return clamped.filter((p) => {
      if (seen.has(p.value)) return false;
      seen.add(p.value);
      return true;
    });
  }, [minAmount, maxAmount, bigBlind, minChip, potAmount]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex w-[400px] flex-col gap-4 rounded-xl bg-gray-900 p-8">
        <h2 className="text-center font-bold text-white text-xl">
          {type} 金額を入力
        </h2>

        <div className="flex flex-wrap justify-center gap-2">
          {presets.map((p) => {
            const active = numeric === p.value;
            return (
              <button
                key={p.label}
                type="button"
                className={`rounded-full border px-4 py-2 font-bold text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary text-black"
                    : "border-white bg-black-deep text-white hover:opacity-80"
                }`}
                onClick={() => setValue(String(p.value))}
              >
                {p.label} ({p.value.toLocaleString()})
              </button>
            );
          })}
        </div>

        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-14 w-full rounded-full border border-black bg-black-darkest px-6 text-center font-bold text-lg text-white"
        />

        <p className="text-center text-gray-400 text-xs">
          範囲: {minAmount.toLocaleString()} 〜 {maxAmount.toLocaleString()}
        </p>

        <div className="flex flex-col gap-2">
          <RoundButton
            type="primary"
            size="full"
            text={`${type} を実行`}
            disabled={isInvalid}
            onClick={() => onConfirm(numeric)}
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
