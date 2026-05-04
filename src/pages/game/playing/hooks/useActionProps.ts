import { useMemo, useRef, useState } from "react";
import { api } from "../../../../api/client";
import { trackError } from "../../../../features/error_tracker";
import type { VoiceCommandLogEntry } from "../../../../features/voice_input_indicator";
import type { TexasHoldemBoard } from "../../../../types";
import type { ActionProps } from "../page";

export type Actionable = {
  call: boolean;
  check: boolean;
  fold: boolean;
  bet: boolean;
  raise: boolean;
  allin: boolean;
};

const defaultActionable: Actionable = {
  call: false,
  check: false,
  fold: false,
  bet: false,
  raise: false,
  allin: false,
};

function computeActionable(board: TexasHoldemBoard): Actionable {
  if (board.phase === "showdown") return defaultActionable;

  const me = board.players.find((p) => p.position === board.currentTurn);
  if (!me || me.hasFolded || me.isAllIn || me.stack === 0) {
    return defaultActionable;
  }

  const hasIncomingBet = board.currentBet > me.betInRound;

  return {
    call: hasIncomingBet,
    check: !hasIncomingBet,
    fold: true,
    bet: !hasIncomingBet && me.stack > 0,
    raise: hasIncomingBet && me.stack > 0,
    allin: me.stack > 0,
  };
}

export function useActionProps(
  board: TexasHoldemBoard | null,
  onActionLogged?: (entry: VoiceCommandLogEntry) => void,
  onSuccess?: () => void,
): ActionProps & { actionable: Actionable } {
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);

  const actionable = useMemo<Actionable>(() => {
    if (!board) return defaultActionable;
    return computeActionable(board);
  }, [board]);

  const actions = useMemo(() => {
    const guard = <A extends unknown[]>(
      actionName: VoiceCommandLogEntry["action"],
      fn: (...args: A) => Promise<boolean>,
      getAmount?: (...args: A) => number | null,
    ) => {
      return async (...args: A) => {
        if (!board || isProcessingRef.current) return;
        const seat =
          board.players.find((p) => p.position === board.currentTurn)
            ?.position ?? null;
        isProcessingRef.current = true;
        setIsProcessing(true);
        try {
          const succeeded = await fn(...args);
          if (succeeded) {
            onActionLogged?.({
              action: actionName,
              amount: getAmount?.(...args) ?? null,
              seatNumber: seat,
              timestamp: Date.now(),
            });
            onSuccess?.();
          }
        } finally {
          isProcessingRef.current = false;
          setIsProcessing(false);
        }
      };
    };

    return {
      onCall: guard("call", async () => {
        try {
          await api.action.call();
          return true;
        } catch (e) {
          trackError({ type: "game_action_error", message: String(e) });
          return false;
        }
      }),
      onCheck: guard("check", async () => {
        try {
          await api.action.check();
          return true;
        } catch (e) {
          trackError({ type: "game_action_error", message: String(e) });
          return false;
        }
      }),
      onFold: guard("fold", async () => {
        try {
          await api.action.fold();
          return true;
        } catch (e) {
          trackError({ type: "game_action_error", message: String(e) });
          return false;
        }
      }),
      onBet: guard(
        "bet",
        async (amount: number) => {
          try {
            await api.action.bet(amount);
            return true;
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            return false;
          }
        },
        (amount) => amount,
      ),
      onRaise: guard(
        "raise",
        async (amount: number) => {
          try {
            await api.action.raise(amount);
            return true;
          } catch (e) {
            trackError({ type: "game_action_error", message: String(e) });
            return false;
          }
        },
        (amount) => amount,
      ),
      onAllIn: guard("all-in", async () => {
        try {
          await api.action.allin();
          return true;
        } catch (e) {
          trackError({ type: "game_action_error", message: String(e) });
          return false;
        }
      }),
    };
  }, [board, onActionLogged, onSuccess]);

  return useMemo(
    () => ({
      actionable,
      isProcessing,
      ...actions,
    }),
    [actionable, isProcessing, actions],
  );
}
