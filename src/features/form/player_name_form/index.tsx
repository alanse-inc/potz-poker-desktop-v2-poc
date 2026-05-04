import { useCallback, useState } from "react";
import { FormText } from "../../../ui/form/form_text";
import PlayerNameIconSVG from "../../player/player.svg";
import { validatePlayerName } from "./validate_player_name_input";

const MAX_LENGTH = 8;

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function PlayerNameForm({ value, onChange }: Props) {
  const [currentValue, setCurrentValue] = useState<string>(value);
  const [displayValue, setDisplayValue] = useState<string>(value);
  const [isError, setIsError] = useState<boolean>(false);

  const handleChange = useCallback(
    (e: string) => {
      // 大文字に変換する
      const newValue = e.toUpperCase();
      setDisplayValue(newValue);

      const validatedValue = validatePlayerName(newValue, MAX_LENGTH);
      setIsError(newValue !== validatedValue);

      if (validatedValue !== currentValue) {
        setCurrentValue(validatedValue);
        onChange(validatedValue);
      }
    },
    [onChange, currentValue],
  );

  // blur時にdisplayValueをcurrentValueに合わせる
  const handleBlur = useCallback(() => {
    setDisplayValue(currentValue);
    setIsError(false);
  }, [currentValue]);

  return (
    <div className="flex w-full flex-col gap-1">
      <FormText
        value={displayValue}
        icon={<img src={PlayerNameIconSVG} alt="player" />}
        placeholder="NAME"
        isError={isError}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {isError && (
        <p className="mt-1 text-red-500 text-sm">英数字のみ入力可能です</p>
      )}
    </div>
  );
}
