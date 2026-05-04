/**
 * Auto Game Setting - ゲーム設定ボタン
 */

import { SquareButton } from "../../../../ui/button/square_button";

type Props = {
  onBtnButtonClick: () => void;
  disabled?: boolean;
};

export function AutoGameSettingButtons({ onBtnButtonClick, disabled }: Props) {
  return (
    <div className="grid h-80 w-62 grid-cols-2 grid-rows-3 place-items-center">
      <SquareButton
        type="black"
        text={["BTN"]}
        onClick={onBtnButtonClick}
        disabled={disabled}
        className="row-start-2"
      />
    </div>
  );
}
