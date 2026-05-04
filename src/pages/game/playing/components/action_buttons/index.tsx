import { SquareButton } from "../../../../../ui/button/square_button";

export type ActionType =
  | "call"
  | "check"
  | "fold"
  | "bet"
  | "raise"
  | "allin"
  | "expose";

type Props = {
  onCall: () => Promise<void>;
  onCheck: () => Promise<void>;
  onFold: () => Promise<void>;
  onBet: () => void;
  onRaise: () => void;
  onAllIn: () => Promise<void>;
  disabled: ReadonlyArray<ActionType>;
};

/**
 * ゲームアクションボタン群（FOLD, CHECK/CALL, BET/RAISE, ALL-IN）
 * BACKとRESETは別途RoundButtonとして配置
 *
 * NOTE: disabled配列とハンドラーの同期について
 * - disabled配列はuseActionProps内でboard変更時に非同期で更新される
 * - ハンドラー（onCheck, onCall等）はuseCallbackでboard依存でメモ化されている
 * - ポーカールール上、CHECKとCALLは排他的（同時に有効にならない）ため、
 *   一時的な状態の不整合があっても誤ったアクションが実行されることはない
 * - ハンドラー内で再度isActionableをチェックしているため安全
 */
export const GameActionButtons = (props: Props) => {
  // CHECK/CALL統合ボタンのロジック
  // ポーカールール上、CHECKとCALLは排他的（同時に有効にならない）
  const isCheckEnabled = !props.disabled.includes("check");
  const isCallEnabled = !props.disabled.includes("call");
  const checkCallHandler = isCheckEnabled ? props.onCheck : props.onCall;
  const isCheckCallDisabled = !isCheckEnabled && !isCallEnabled;

  // BET/RAISE統合ボタンのロジック
  // ポーカールール上、BETとRAISEは排他的（同時に有効にならない）
  const isBetEnabled = !props.disabled.includes("bet");
  const isRaiseEnabled = !props.disabled.includes("raise");
  const betRaiseHandler = isBetEnabled ? props.onBet : props.onRaise;
  const isBetRaiseDisabled = !isBetEnabled && !isRaiseEnabled;

  return (
    <div className="flex items-center gap-4">
      <SquareButton
        type="gray"
        text={["FOLD"]}
        onClick={props.onFold}
        disabled={props.disabled.includes("fold")}
      />
      <SquareButton
        type="blue"
        text={["CHECK", "CALL"]}
        onClick={checkCallHandler}
        disabled={isCheckCallDisabled}
      />
      <SquareButton
        type="orange"
        text={["BET", "RAISE"]}
        onClick={betRaiseHandler}
        disabled={isBetRaiseDisabled}
      />
      <SquareButton
        type="primary"
        text={["ALL-IN"]}
        onClick={props.onAllIn}
        disabled={props.disabled.includes("allin")}
      />
    </div>
  );
};

/**
 * EXPOSEボタン（独立配置用）
 */
export const ExposeButton = (props: {
  onExpose: () => void;
  disabled: boolean;
}) => {
  return (
    <SquareButton
      type="black"
      text={["EXPOSE"]}
      disabled={props.disabled}
      onClick={props.onExpose}
    />
  );
};
