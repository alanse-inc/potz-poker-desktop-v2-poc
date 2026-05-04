import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { api } from "../../../api/client";
import { useBoard } from "../../../contexts/board_context";
import type { GameSettings, TexasHoldemBoard } from "../../../types";
import type { ActionType } from "./components/action_buttons";
import { AddPlayerModal } from "./components/add_player_modal";
import { BetAmountModal } from "./components/bet_amount_modal";
import { EditCommunityCardModal } from "./components/edit_community_card_modal";
import { PlayerEditModal } from "./components/player_edit_modal";
import { SelectExposeCardModal } from "./components/select_expose_card_modal";
import { useCardPlacedHandler } from "./hooks/useCardPlacedHandler";
import { type ActionConfirmType, type ActionProps, Page } from "./page";

const ALL_DISABLED: ActionType[] = [
  "call",
  "check",
  "fold",
  "bet",
  "raise",
  "allin",
];

function computeDisabledActions(board: TexasHoldemBoard): ActionType[] {
  if (board.phase === "showdown") return [...ALL_DISABLED];

  const me = board.players.find((p) => p.position === board.currentTurn);
  if (!me || me.hasFolded || me.isAllIn) return [...ALL_DISABLED];

  // スタック 0 のプレイヤーは何もアクションできない（BET/RAISE/CALL/ALL-IN は不可）
  if (me.stack === 0) return [...ALL_DISABLED];

  const disabled: ActionType[] = [];

  if (board.currentBet > me.betInRound) {
    disabled.push("check");
  } else {
    disabled.push("call");
  }

  if (board.currentBet > 0) {
    disabled.push("bet");
  } else {
    disabled.push("raise");
  }

  return disabled;
}

function reportError(e: unknown, fallback: string) {
  const message =
    e instanceof Error ? e.message : typeof e === "string" ? e : fallback;
  toast.error(message);
}

export function GamePlaying() {
  const { board, refresh } = useBoard();
  const navigate = useNavigate();

  // RFID カード配置イベントを処理
  useCardPlacedHandler();
  const [isOpenResetConfirm, setIsOpenResetConfirm] = useState(false);
  const [confirmType, setConfirmType] = useState<ActionConfirmType | null>(
    null,
  );
  const [editLocateNumber, setEditLocateNumber] = useState<number | null>(null);
  const [editPlayerPosition, setEditPlayerPosition] = useState<number | null>(
    null,
  );
  const [isOpenAddPlayer, setIsOpenAddPlayer] = useState(false);
  const [isOpenExpose, setIsOpenExpose] = useState(false);
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null);

  // BET/RAISE 計算で使用するため永続化されたブラインド設定を取得
  useEffect(() => {
    api.gameSettings
      .load()
      .then(setGameSettings)
      .catch(() => {
        setGameSettings(null);
      });
  }, []);

  const handleBackAction = useCallback(async () => {
    try {
      await api.board.backBoard();
      await refresh();
    } catch (e) {
      reportError(e, "BACK に失敗しました");
    }
  }, [refresh]);

  const handleNextGame = useCallback(() => {
    navigate("/game/next-game");
  }, [navigate]);

  const handleResetConfirm = useCallback(async () => {
    try {
      await api.board.resetBoard();
      setIsOpenResetConfirm(false);
      navigate("/game/setting");
    } catch (e) {
      setIsOpenResetConfirm(false);
      reportError(e, "リセットに失敗しました");
    }
  }, [navigate]);

  const handlePlayerCardPress = useCallback((position: number) => {
    setEditPlayerPosition(position);
  }, []);

  const handlePlayerEdited = useCallback(async () => {
    try {
      await refresh();
    } catch (e) {
      reportError(e, "ボードの更新に失敗しました");
    }
  }, [refresh]);

  const handleEditCommunityCard = useCallback((locateNumber: number) => {
    setEditLocateNumber(locateNumber);
  }, []);

  const handleEditCommunityCardConfirmed = useCallback(async () => {
    setEditLocateNumber(null);
    try {
      await refresh();
    } catch (e) {
      reportError(e, "ボードの更新に失敗しました");
    }
  }, [refresh]);

  const handleExposeConfirmed = useCallback(async () => {
    setIsOpenExpose(false);
    try {
      await refresh();
    } catch (e) {
      reportError(e, "ボードの更新に失敗しました");
    }
  }, [refresh]);

  const actionProps: ActionProps = useMemo(
    () => ({
      isProcessing: false,
      onCall: async () => {
        try {
          await api.action.call();
          await refresh();
        } catch (e) {
          reportError(e, "CALL に失敗しました");
        }
      },
      onCheck: async () => {
        try {
          await api.action.check();
          await refresh();
        } catch (e) {
          reportError(e, "CHECK に失敗しました");
        }
      },
      onFold: async () => {
        try {
          await api.action.fold();
          await refresh();
        } catch (e) {
          reportError(e, "FOLD に失敗しました");
        }
      },
      onBet: async (amount: number) => {
        try {
          await api.action.bet(amount);
          await refresh();
        } catch (e) {
          reportError(e, "BET に失敗しました");
        }
      },
      onRaise: async (amount: number) => {
        try {
          await api.action.raise(amount);
          await refresh();
        } catch (e) {
          reportError(e, "RAISE に失敗しました");
        }
      },
      onAllIn: async () => {
        try {
          await api.action.allin();
          await refresh();
        } catch (e) {
          reportError(e, "ALL-IN に失敗しました");
        }
      },
    }),
    [refresh],
  );

  const resetConfirmProps = useMemo(
    () => ({
      isOpen: isOpenResetConfirm,
      onOpenClick: () => setIsOpenResetConfirm(true),
      onConfirmClick: handleResetConfirm,
      onCloseClick: () => setIsOpenResetConfirm(false),
    }),
    [isOpenResetConfirm, handleResetConfirm],
  );

  const disabledActionTypes: ActionType[] = useMemo(() => {
    if (!board) return ALL_DISABLED;
    return computeDisabledActions(board);
  }, [board]);

  const me = useMemo(
    () => board?.players.find((p) => p.position === board.currentTurn),
    [board],
  );

  const bigBlindAmount = useMemo(() => {
    if (gameSettings?.bigBlind) return gameSettings.bigBlind;
    // フォールバック: BBポジションの betInRound (preflop のみ有効)
    if (board?.players[board.bbPosition]?.betInRound) {
      return board.players[board.bbPosition].betInRound;
    }
    return board?.currentBet ?? 0;
  }, [gameSettings, board]);

  const minRaise = useMemo(() => {
    if (!board) return 0;
    // 最低レイズ額 = currentBet + bigBlind（標準的なポーカーの最低レイズ額）
    return board.currentBet + bigBlindAmount;
  }, [board, bigBlindAmount]);

  const minBet = useMemo(() => {
    return Math.max(bigBlindAmount, 1);
  }, [bigBlindAmount]);

  const handleConfirmAmount = useCallback(
    async (amount: number) => {
      if (!confirmType) return;
      const type = confirmType;
      setConfirmType(null);
      if (type === "BET") {
        await actionProps.onBet(amount);
      } else {
        await actionProps.onRaise(amount);
      }
    },
    [actionProps, confirmType],
  );

  const isShowdown = board?.phase === "showdown";

  // Expose ボタンの disabled ロジック: preflop かつコミュニティカードが 0 枚のときのみ有効
  const isExposeDisabled = useMemo(() => {
    if (!board) return true;
    return board.phase !== "pre_flop" || board.communityCards.length > 0;
  }, [board]);

  const winnerText = useMemo(() => {
    if (!board || board.phase !== "showdown" || board.winners.length === 0) {
      return undefined;
    }
    const names = board.winners
      .map((pos) => board.players.find((p) => p.position === pos)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length === 0) return undefined;
    return `Winner: ${names.join(", ")}`;
  }, [board]);

  const clickableLocateNumbers = useMemo(() => {
    if (!board || board.phase === "showdown") return [];
    const next = board.communityCards.length;
    if (next < 5) return [next];
    return [];
  }, [board]);

  if (!board) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black-deep">
        <p className="font-bold text-white">ゲームが開始されていません</p>
      </div>
    );
  }

  const editTargetPlayer =
    editPlayerPosition !== null
      ? board.players.find((p) => p.position === editPlayerPosition)
      : undefined;

  return (
    <>
      <Page
        board={board}
        disabledActionTypes={disabledActionTypes}
        actionProps={actionProps}
        resetConfirmProps={resetConfirmProps}
        onPlayerCardPress={handlePlayerCardPress}
        onBackAction={handleBackAction}
        onNextGame={handleNextGame}
        isNextGameDisabled={false}
        isShowdown={isShowdown}
        centerText={winnerText}
        onRequestBet={() => setConfirmType("BET")}
        onRequestRaise={() => setConfirmType("RAISE")}
        clickableLocateNumbers={clickableLocateNumbers}
        onEditCommunityCard={handleEditCommunityCard}
        onAddPlayer={() => setIsOpenAddPlayer(true)}
        isAddPlayerDisabled={!isShowdown || board.players.length >= 10}
        onExpose={() => setIsOpenExpose(true)}
        isExposeDisabled={isExposeDisabled}
      />
      {confirmType && me && me.stack > 0 && (
        <BetAmountModal
          type={confirmType}
          minAmount={confirmType === "BET" ? minBet : minRaise}
          maxAmount={me.stack + me.betInRound}
          bigBlind={bigBlindAmount}
          onCancel={() => setConfirmType(null)}
          onConfirm={handleConfirmAmount}
        />
      )}
      {editLocateNumber !== null && (
        <EditCommunityCardModal
          locateNumber={editLocateNumber}
          onClose={() => setEditLocateNumber(null)}
          onConfirmed={handleEditCommunityCardConfirmed}
        />
      )}
      {editTargetPlayer && (
        <PlayerEditModal
          player={editTargetPlayer}
          isShowdown={isShowdown}
          canRemove={board.players.length > 2}
          onClose={() => setEditPlayerPosition(null)}
          onUpdated={handlePlayerEdited}
        />
      )}
      {isOpenAddPlayer && (
        <AddPlayerModal
          defaultName={`Player${board.players.length + 1}`}
          onClose={() => setIsOpenAddPlayer(false)}
          onAdded={handlePlayerEdited}
        />
      )}
      {isOpenExpose && (
        <SelectExposeCardModal
          onClose={() => setIsOpenExpose(false)}
          onConfirmed={handleExposeConfirmed}
        />
      )}
    </>
  );
}
