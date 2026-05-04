import { useCallback } from "react";
import backspaceSvg from "./backspace.svg";
export type NumericKeyboardProps = {
  onNumberPress: (num: number) => void;
  onDoubleZeroPress: () => void;
  onBackspacePress: () => void;
};

const BUTTON_CLASSES =
  "flex items-center justify-center rounded bg-[#333333] px-2.5 py-0 font-['Gotham'] font-bold text-[36px] text-white leading-[1.5em] hover:bg-gray-700";

export const NumericKeyboard = ({
  onNumberPress,
  onDoubleZeroPress,
  onBackspacePress,
}: NumericKeyboardProps) => {
  const handleNumberPress = useCallback(
    (num: number) => {
      onNumberPress(num);
    },
    [onNumberPress],
  );

  return (
    <div className="grid flex-1 auto-rows-fr grid-cols-3 gap-3 self-stretch">
      {/* 1行目: 1, 2, 3 */}
      {[1, 2, 3].map((num) => (
        <button
          key={num}
          type="button"
          className={BUTTON_CLASSES}
          onClick={() => handleNumberPress(num)}
        >
          {num}
        </button>
      ))}

      {/* 2行目: 4, 5, 6 */}
      {[4, 5, 6].map((num) => (
        <button
          key={num}
          type="button"
          className={BUTTON_CLASSES}
          onClick={() => handleNumberPress(num)}
        >
          {num}
        </button>
      ))}

      {/* 3行目: 7, 8, 9 */}
      {[7, 8, 9].map((num) => (
        <button
          key={num}
          type="button"
          className={BUTTON_CLASSES}
          onClick={() => handleNumberPress(num)}
        >
          {num}
        </button>
      ))}

      {/* 4行目: 0, 00, 削除 */}
      <button
        type="button"
        className={BUTTON_CLASSES}
        onClick={() => handleNumberPress(0)}
      >
        0
      </button>
      <button
        type="button"
        className={BUTTON_CLASSES}
        onClick={onDoubleZeroPress}
      >
        00
      </button>
      <button
        type="button"
        className="flex items-center justify-center self-stretch rounded bg-[#333333] p-2.5 text-white hover:bg-gray-700"
        onClick={onBackspacePress}
      >
        <img src={backspaceSvg} alt="backspace" className="h-12 w-12" />
      </button>
    </div>
  );
};
