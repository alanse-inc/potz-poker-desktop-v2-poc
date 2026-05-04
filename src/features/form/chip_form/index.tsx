import { useCallback, useState } from "react";
import { FormText } from "../../../ui/form/form_text";
import ChipIconSVG from "../../chip/chip.svg";
import { formatChipWithSuffix } from "../../chip/format_chip_with_suffix";
import { validateChipInput } from "../../chip/validate_chip_input";

const MAX_CHIP_VALUE = 1000000000; // 10億

type Props = {
  value: number;
  onChange: (value: number) => void;
};

export function ChipForm({ value, onChange }: Props) {
  const [displayValue, setDisplayValue] = useState<string>(
    formatDisplayValue(value),
  );

  // 入力時は数値を検証し、カンマ区切りでフォーマットして表示する。
  // validateChipInput が非数値（カンマ含む）を strip してくれるため、
  // ユーザーが「1000」と入力しても「1,000」と動的に整形される。
  const handleChange = useCallback(
    (newValue: string) => {
      const validatedValue = validateChipInput(newValue, MAX_CHIP_VALUE);
      if (validatedValue !== value) {
        onChange(validatedValue);
      }
      setDisplayValue(
        validatedValue > 0 ? validatedValue.toLocaleString("en-US") : "",
      );
    },
    [onChange, value],
  );

  // フォーカス時はカンマ区切りで編集可能な形式を表示する。
  // （K/M サフィックス形式だと数値再編集しにくいため、入力モードでは
  //   生の数値ベース + カンマ区切り表示に切り替える）
  const handleFocus = useCallback(() => {
    setDisplayValue(value > 0 ? value.toLocaleString("en-US") : "");
  }, [value]);

  // ブラー時にはサフィックス付きの表示形式に変換する
  const handleBlur = useCallback(() => {
    setDisplayValue(formatDisplayValue(value));
  }, [value]);

  return (
    <FormText
      value={displayValue}
      icon={<img src={ChipIconSVG} alt="chip" />}
      placeholder="STACK"
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
    />
  );
}

/**
 * 表示用の値をフォーマットする関数
 *
 * - 0の場合は空文字を返す
 * - 数値の場合はサフィックス付きの文字列を返す
 *
 * @param value チップの数値
 * @returns フォーマットされた表示用文字列
 */
function formatDisplayValue(value: number): string {
  if (value === 0) {
    return "";
  }

  return formatChipWithSuffix(value);
}
