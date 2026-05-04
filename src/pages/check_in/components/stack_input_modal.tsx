import { useCallback, useEffect, useRef } from "react";
import { validateChipInput } from "../../../features/chip/validate_chip_input";
import { NumericKeyboard } from "../../../features/keyboard/numeric_keyboard";
import { PlayerIcon } from "../../../features/player/player_icon";
import { RoundButton } from "../../../ui/button/round_button";
import { Modal } from "../../../ui/modal";

export type StackInputModalProps = {
  playerName?: string;
  playerIcon?: string | null;
  value: number;
  onChange: (value: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

const MAX_CHIP_VALUE = 1000000000;

export function StackInputModal({
  playerName,
  playerIcon,
  value,
  onChange,
  onSubmit,
  onCancel,
}: StackInputModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = useCallback(
    (newValue: string) => {
      const validatedValue = validateChipInput(newValue, MAX_CHIP_VALUE);
      if (validatedValue !== value) {
        onChange(validatedValue);
      }
    },
    [onChange, value],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && value !== 0) {
        onSubmit();
      }
    },
    [onSubmit, value],
  );

  const formattedValue =
    value === 0 ? "" : value.toLocaleString("en-US", { useGrouping: true });

  return (
    <Modal>
      <div className="flex h-[calc(100vh-80px)] w-[calc(100vw-80px)] max-w-[500px] flex-col items-stretch gap-2.5 bg-[#222222]">
        <div className="flex items-center justify-center gap-4 px-4 pt-4 pb-2">
          <PlayerIcon
            playerIcon={playerIcon ?? null}
            bgColor={playerIcon ? "white" : "gray"}
            size="small"
          />
          <span className="font-bold text-[18px] text-white">
            {playerName || "名前未設定"}
          </span>
        </div>

        <div className="flex flex-col px-4">
          <p className="mb-2 text-center text-gray-400 text-sm">
            スタックを入力してください
          </p>
          <div className="flex flex-col justify-center gap-[6px] py-2">
            <div className="flex flex-col gap-[5px] self-stretch">
              <div className="flex flex-row items-center gap-4 self-stretch">
                <div className="flex flex-row items-center self-stretch">
                  <input
                    ref={inputRef}
                    placeholder="1,000"
                    value={formattedValue}
                    inputMode="none"
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/,/g, "");
                      handleChange(rawValue);
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-full border-none bg-transparent font-['Noto_Sans_JP'] text-[20px] text-white leading-[1.2em] caret-[#CAFF33] outline-none placeholder:text-gray-500"
                  />
                </div>
              </div>
            </div>
            <div className="h-[1px] w-full bg-[#555555]" />
          </div>
        </div>

        <div className="flex flex-1 flex-col items-stretch gap-6 self-stretch px-4">
          <div className="flex gap-6">
            <RoundButton
              type="dark-gray"
              size="full"
              text="CANCEL"
              onClick={onCancel}
            />
            <RoundButton
              type="primary"
              size="full"
              text="OK"
              disabled={value === 0}
              onClick={onSubmit}
            />
          </div>

          <div className="flex flex-1">
            <NumericKeyboard
              onNumberPress={(num) =>
                handleChange(value.toString() + num.toString())
              }
              onDoubleZeroPress={() => handleChange(`${value.toString()}00`)}
              onBackspacePress={() =>
                handleChange(value.toString().slice(0, -1))
              }
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
