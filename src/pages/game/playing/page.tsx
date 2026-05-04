import { useAutoScale } from "../../../hooks/useAutoScale";
import type { TexasHoldemBoard } from "../../../types";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import {
  type ActionType,
  GameActionButtons,
} from "./components/action_buttons";
import { PlayingBoard } from "./components/board";

export type ActionProps = {
  isProcessing: boolean;
  onCall: () => Promise<void>;
  onCheck: () => Promise<void>;
  onFold: () => Promise<void>;
  onBet: (amount: number) => Promise<void>;
  onRaise: (amount: number) => Promise<void>;
  onAllIn: () => Promise<void>;
};

export type ActionConfirmType = "BET" | "RAISE";

type ResetConfirmProps = {
  isOpen: boolean;
  onOpenClick: () => void;
  onConfirmClick: () => void;
  onCloseClick: () => void;
};

type Props = {
  board: TexasHoldemBoard;
  disabledActionTypes: ReadonlyArray<ActionType>;
  actionProps: ActionProps;
  resetConfirmProps: ResetConfirmProps;
  centerText?: string;
  onPlayerCardPress: (position: number) => void;
  onBackAction: () => void;
  onNextGame: () => void;
  isNextGameDisabled: boolean;
  isShowdown: boolean;
  onRequestBet: () => void;
  onRequestRaise: () => void;
  clickableLocateNumbers: number[];
  onEditCommunityCard: (locateNumber: number) => void;
  onAddPlayer: () => void;
  isAddPlayerDisabled: boolean;
  onExpose: () => void;
  isExposeDisabled: boolean;
};

export function Page(props: Props) {
  const {
    board,
    disabledActionTypes,
    actionProps,
    resetConfirmProps,
    centerText,
    onPlayerCardPress,
    onBackAction,
    onNextGame,
    isNextGameDisabled,
    isShowdown,
    onRequestBet,
    onRequestRaise,
    clickableLocateNumbers,
    onEditCommunityCard,
    onAddPlayer,
    isAddPlayerDisabled,
    onExpose,
    isExposeDisabled,
  } = props;

  // 自動スケーリング用のHookを使用（Board部分のみ、最小0.4倍〜最大1.6倍）
  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.4);

  // アクションボタンエリアの自動スケーリング（656px × 96px、最小0.7倍〜最大1.5倍）
  const { containerRef: actionContainerRef, contentRef: actionContentRef } =
    useAutoScale(656, 96, 1.5, 0.7);

  return (
    <BasicPage>
      <div className="relative flex h-full w-full flex-col items-center p-4 pb-2 lg:p-8 lg:pb-4">
        {/* ヘッダー: BACK（左）、RESET + Showdownボタン（右） */}
        <div className="flex h-14 w-full items-center justify-between">
          {/* 左: BACK */}
          <RoundButton
            type="black"
            text="BACK"
            size="auto"
            onClick={onBackAction}
          />

          {/* 右: EXPOSE + ADD PLAYER + Showdownボタン + RESET */}
          <div className="flex items-center gap-4">
            {!isShowdown && (
              <RoundButton
                type="black"
                text="EXPOSE"
                size="auto"
                onClick={onExpose}
                disabled={isExposeDisabled}
              />
            )}
            <RoundButton
              type="black"
              text="+ プレイヤー"
              size="auto"
              onClick={onAddPlayer}
              disabled={isAddPlayerDisabled}
            />
            {isShowdown && (
              <RoundButton
                type="primary"
                text="NEXT GAME"
                size="auto"
                onClick={onNextGame}
                disabled={isNextGameDisabled}
              />
            )}
            {!isShowdown && (
              <RoundButton
                type="black"
                text="RESET"
                size="auto"
                onClick={resetConfirmProps.onOpenClick}
              />
            )}
          </div>
        </div>

        {/* メインコンテンツ: Board */}
        <div
          ref={containerRef}
          className="relative flex w-full flex-1 items-center justify-center"
        >
          <div
            ref={contentRef}
            className="absolute"
            style={{
              width: "950px",
              height: "400px",
            }}
          >
            <div className="flex h-full items-center justify-center">
              <PlayingBoard
                board={board}
                onPlayerCardPress={onPlayerCardPress}
                centerText={centerText}
                clickableLocateNumbers={clickableLocateNumbers}
                onEditCommunityCard={onEditCommunityCard}
              />
            </div>
          </div>
        </div>

        {/* フッター: アクションボタン群 */}
        <div
          ref={actionContainerRef}
          className="relative flex min-h-[96px] w-full items-center justify-center lg:min-h-[144px]"
        >
          {!isShowdown && (
            <div
              ref={actionContentRef}
              className="absolute"
              style={{
                width: "656px",
                height: "96px",
              }}
            >
              <div className="z-10 flex h-full items-center justify-center gap-12">
                <GameActionButtons
                  onCall={actionProps.onCall}
                  onCheck={actionProps.onCheck}
                  onFold={actionProps.onFold}
                  onBet={onRequestBet}
                  onRaise={onRequestRaise}
                  onAllIn={actionProps.onAllIn}
                  disabled={disabledActionTypes}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reset確認ダイアログ（簡易実装） */}
      {resetConfirmProps.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex flex-col gap-4 rounded-xl bg-gray-900 p-8">
            <p className="text-center font-bold text-white">
              ゲームをリセットしますか？
            </p>
            <div className="flex gap-4">
              <button
                type="button"
                className="rounded-full bg-primary px-8 py-3 font-bold"
                onClick={resetConfirmProps.onConfirmClick}
              >
                はい
              </button>
              <button
                type="button"
                className="rounded-full border border-white bg-black px-8 py-3 font-bold text-white"
                onClick={resetConfirmProps.onCloseClick}
              >
                いいえ
              </button>
            </div>
          </div>
        </div>
      )}
    </BasicPage>
  );
}
