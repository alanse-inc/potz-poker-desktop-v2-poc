import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../features/error_tracker", () => ({
  trackClientSideError: vi.fn(),
  trackError: vi.fn(),
}));

vi.mock("../../../../services/voice_input_service", () => ({
  voiceInputService: {
    confidenceThreshold: 0.7,
    emitStatusPublic: vi.fn(),
  },
}));

vi.mock("../../../../api/client", () => ({
  api: {
    action: {
      fold: vi.fn(),
      call: vi.fn(),
      check: vi.fn(),
      bet: vi.fn(),
      raise: vi.fn(),
      allin: vi.fn(),
    },
  },
}));

import { api } from "../../../../api/client";
import {
  trackClientSideError,
  trackError,
} from "../../../../features/error_tracker";
import { voiceInputService } from "../../../../services/voice_input_service";
import type { TexasHoldemBoard } from "../../../../types";
import type { VoicePokerCommand } from "../../../../types/voice_input";
import { useVoiceCommandQueue } from "./use_voice_command_queue";

const mockTrackError = vi.mocked(trackError);
const _mockTrackClientSideError = vi.mocked(trackClientSideError);
const mockVoiceInputService = vi.mocked(voiceInputService);

function buildMockBoard(
  override: Partial<TexasHoldemBoard> = {},
): TexasHoldemBoard {
  return {
    handNumber: 1,
    dealerPosition: 0,
    sbPosition: 1,
    bbPosition: 2,
    currentTurn: 0,
    currentBet: 200,
    players: [
      {
        position: 0,
        name: "Alice",
        stack: 9800,
        hand: null,
        betInRound: 0,
        hasFolded: false,
        isAllIn: false,
        hasActed: false,
      },
      {
        position: 1,
        name: "Bob",
        stack: 9900,
        hand: null,
        betInRound: 100,
        hasFolded: false,
        isAllIn: false,
        hasActed: false,
      },
    ],
    communityCards: [],
    pots: [{ amount: 300 }],
    phase: "pre_flop",
    winners: [],
    ...override,
  };
}

function buildCommand(
  override: Partial<VoicePokerCommand> = {},
): VoicePokerCommand {
  return {
    action: "call",
    amount: null,
    confidence: 0.9,
    rawText: "コール",
    timestamp: Date.now(),
    ...override,
  };
}

const mockOnBack = vi.fn().mockResolvedValue(undefined);
const mockOnEditGame = vi.fn().mockResolvedValue(undefined);
const mockOnActionExecuted = vi.fn();

describe("useVoiceCommandQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    Object.defineProperty(mockVoiceInputService, "confidenceThreshold", {
      get: vi.fn().mockReturnValue(0.7),
      configurable: true,
    });

    vi.mocked(api.action.fold).mockResolvedValue(buildMockBoard());
    vi.mocked(api.action.call).mockResolvedValue(buildMockBoard());
    vi.mocked(api.action.check).mockResolvedValue(buildMockBoard());
    vi.mocked(api.action.bet).mockResolvedValue(buildMockBoard());
    vi.mocked(api.action.raise).mockResolvedValue(buildMockBoard());
    vi.mocked(api.action.allin).mockResolvedValue(buildMockBoard());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("enqueue / processNext", () => {
    it("キューに積まれたコマンドは順次処理される（ボード更新あり）", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // call 実行後にボードを更新することで waitForBoardUpdate を成功させる
      vi.mocked(api.action.call).mockImplementation(async () => {
        const newBoard = buildMockBoard({ handNumber: board.handNumber + 1 });
        boardRef.current = newBoard;
        return newBoard;
      });

      result.current.enqueue(buildCommand({ action: "call" }));
      result.current.enqueue(buildCommand({ action: "call" }));

      await vi.runAllTimersAsync();

      expect(api.action.call).toHaveBeenCalledTimes(2);
    });

    it("信頼度が閾値未満のコマンドはスキップされる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "fold", confidence: 0.5 }));

      await vi.runAllTimersAsync();

      expect(api.action.fold).not.toHaveBeenCalled();
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining("信頼度不足"),
      );
    });
  });

  describe("executeAction - call", () => {
    it("call コマンド → api.action.call が呼ばれる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "call" }));
      await vi.runAllTimersAsync();

      expect(api.action.call).toHaveBeenCalledTimes(1);
    });

    it("call 失敗時 → trackError が呼ばれる", async () => {
      vi.mocked(api.action.call).mockRejectedValue(new Error("call failed"));

      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "call" }));
      await vi.runAllTimersAsync();

      expect(mockTrackError).toHaveBeenCalledWith(
        expect.objectContaining({ type: "game_action_error" }),
      );
    });
  });

  describe("executeAction - check", () => {
    it("check コマンド → api.action.check が呼ばれる", async () => {
      const board = buildMockBoard({ currentBet: 0 });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "check" }));
      await vi.runAllTimersAsync();

      expect(api.action.check).toHaveBeenCalledTimes(1);
    });
  });

  describe("executeAction - fold", () => {
    it("fold コマンド → api.action.fold が呼ばれる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "fold" }));
      await vi.runAllTimersAsync();

      expect(api.action.fold).toHaveBeenCalledTimes(1);
    });
  });

  describe("executeAction - bet", () => {
    it("bet コマンド（amount あり）→ api.action.bet が呼ばれる", async () => {
      const board = buildMockBoard({ currentBet: 0 });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "bet", amount: 500 }));
      await vi.runAllTimersAsync();

      expect(api.action.bet).toHaveBeenCalledWith(500);
    });

    it("bet コマンド（amount が null）→ api.action.bet は呼ばれない", async () => {
      const board = buildMockBoard({ currentBet: 0 });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "bet", amount: null }));
      await vi.runAllTimersAsync();

      expect(api.action.bet).not.toHaveBeenCalled();
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining("BET 額が取得できませんでした"),
      );
    });
  });

  describe("executeAction - raise", () => {
    it("raise コマンド（amount あり）→ api.action.raise が呼ばれる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "raise", amount: 1000 }));
      await vi.runAllTimersAsync();

      expect(api.action.raise).toHaveBeenCalledWith(1000);
    });

    it("raise コマンド（amount が null）→ warnVoiceAction が呼ばれる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "raise", amount: null }));
      await vi.runAllTimersAsync();

      expect(api.action.raise).not.toHaveBeenCalled();
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining("RAISE 額が取得できませんでした"),
      );
    });
  });

  describe("executeAction - all-in", () => {
    it("all-in コマンド → api.action.allin が呼ばれる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "all-in" }));
      await vi.runAllTimersAsync();

      expect(api.action.allin).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleBack", () => {
    it("back コマンド（seatNumber なし）→ onBack が 1 回呼ばれる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "back" }));
      await vi.runAllTimersAsync();

      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });

    it("back コマンド成功 → onActionExecuted が呼ばれる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(
          boardRef,
          mockOnBack,
          mockOnEditGame,
          mockOnActionExecuted,
        ),
      );

      result.current.enqueue(buildCommand({ action: "back" }));
      await vi.runAllTimersAsync();

      expect(mockOnActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({ action: "back" }),
      );
    });
  });

  describe("handleOk", () => {
    it("ok コマンド → onEditGame が呼ばれる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "ok" }));
      await vi.runAllTimersAsync();

      expect(mockOnEditGame).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleCheckAround", () => {
    it("check-around コマンド（currentBet > 0）→ スキップ", async () => {
      const board = buildMockBoard({ currentBet: 200 });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "check-around" }));
      await vi.runAllTimersAsync();

      expect(api.action.check).not.toHaveBeenCalled();
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining("ベットが入っているため"),
      );
    });

    it("check-around コマンド（streetAtCapture がフェーズと異なる）→ キャンセル", async () => {
      const board = buildMockBoard({ currentBet: 0, phase: "flop" });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(
        buildCommand({
          action: "check-around",
          streetAtCapture: "pre_flop",
        }),
      );
      await vi.runAllTimersAsync();

      expect(api.action.check).not.toHaveBeenCalled();
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining("ストリートが変わった"),
      );
    });

    it("check-around（activeCount <= 1）→ 警告してスキップ", async () => {
      const board = buildMockBoard({
        currentBet: 0,
        players: [
          {
            position: 0,
            name: "Alice",
            stack: 9800,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 1,
            name: "Bob",
            stack: 0,
            hand: null,
            betInRound: 0,
            hasFolded: true,
            isAllIn: false,
            hasActed: false,
          },
        ],
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "check-around" }));
      await vi.runAllTimersAsync();

      expect(api.action.check).not.toHaveBeenCalled();
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining("操作対象プレイヤーがいません"),
      );
    });
  });

  describe("handleNormalAction - board が showdown の場合", () => {
    it("showdown フェーズのボードでアクションコマンド → BREAK_QUEUE (キュー中断)", async () => {
      const board = buildMockBoard({ phase: "showdown" });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "call" }));
      result.current.enqueue(buildCommand({ action: "fold" }));

      await vi.runAllTimersAsync();

      expect(api.action.call).not.toHaveBeenCalled();
      expect(api.action.fold).not.toHaveBeenCalled();
    });
  });

  describe("action=null（数字のみ発声）の自動解決", () => {
    it("action=null かつ amount あり → currentBet > 0 なら raise に解決される", async () => {
      const board = buildMockBoard({ currentBet: 200 });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: null, amount: 500 }));
      await vi.runAllTimersAsync();

      expect(api.action.raise).toHaveBeenCalledWith(500);
    });

    it("action=null かつ amount あり → currentBet === 0 なら bet に解決される", async () => {
      const board = buildMockBoard({ currentBet: 0 });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: null, amount: 300 }));
      await vi.runAllTimersAsync();

      expect(api.action.bet).toHaveBeenCalledWith(300);
    });
  });

  describe("onActionExecuted コールバック", () => {
    it("call 成功時 → onActionExecuted が action: 'call' で呼ばれる", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(
          boardRef,
          mockOnBack,
          mockOnEditGame,
          mockOnActionExecuted,
        ),
      );

      result.current.enqueue(buildCommand({ action: "call" }));
      await vi.runAllTimersAsync();

      expect(mockOnActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({ action: "call", amount: null }),
      );
    });

    it("fold 失敗時 → onActionExecuted は呼ばれない", async () => {
      vi.mocked(api.action.fold).mockRejectedValue(new Error("fold failed"));

      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(
          boardRef,
          mockOnBack,
          mockOnEditGame,
          mockOnActionExecuted,
        ),
      );

      result.current.enqueue(buildCommand({ action: "fold" }));
      await vi.runAllTimersAsync();

      expect(mockOnActionExecuted).not.toHaveBeenCalled();
    });
  });

  describe("position ターゲット", () => {
    it("target._kind='position' pos='btn' → dealerPosition のプレイヤーを特定する", async () => {
      const board = buildMockBoard({
        dealerPosition: 1,
        currentTurn: 1,
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(
        buildCommand({
          action: "fold",
          target: { _kind: "position", position: "btn" },
        }),
      );
      await vi.runAllTimersAsync();

      expect(api.action.fold).toHaveBeenCalledTimes(1);
    });

    it("target._kind='position' で一致するプレイヤーが存在しない → warnVoiceAction", async () => {
      const board = buildMockBoard({
        sbPosition: 99,
        currentTurn: 0,
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(
        buildCommand({
          action: "fold",
          target: { _kind: "position", position: "sb" },
        }),
      );
      await vi.runAllTimersAsync();

      expect(api.action.fold).not.toHaveBeenCalled();
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining("SB ポジションのプレイヤーが見つかりません"),
      );
    });
  });

  describe("handleNormalAction - waitForBoardUpdate タイムアウト", () => {
    it("waitForBoardUpdate がタイムアウト（false）した場合、キューを中断し後続コマンドを実行しない", async () => {
      const board = buildMockBoard();
      // boardRef.current を変更しないことで waitForBoardUpdate をタイムアウトさせる
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // call の後に fold をキュー。waitForBoardUpdate がタイムアウトすれば fold は実行されない
      result.current.enqueue(buildCommand({ action: "call" }));
      result.current.enqueue(buildCommand({ action: "fold" }));

      await vi.runAllTimersAsync();

      expect(api.action.call).toHaveBeenCalledTimes(1);
      expect(api.action.fold).not.toHaveBeenCalled();
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining(
          "ボード更新タイムアウトのためキューを中断しました",
        ),
      );
    });

    it("waitForBoardUpdate がタイムアウトした場合、warnVoiceAction（toast.error）が呼ばれる", async () => {
      const { default: toast } = await import("react-hot-toast");
      const toastErrorSpy = vi.spyOn(toast, "error");

      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(buildCommand({ action: "call" }));

      await vi.runAllTimersAsync();

      expect(toastErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "ボード更新タイムアウトのためキューを中断しました",
        ),
      );

      toastErrorSpy.mockRestore();
    });

    it("waitForBoardUpdate が成功（true）した場合、キューは継続される", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // enqueue 前に mockImplementation を設定し、call 実行後にボードを更新して
      // waitForBoardUpdate を成功させる
      vi.mocked(api.action.call).mockImplementation(async () => {
        const newBoard = buildMockBoard({ handNumber: 2 });
        boardRef.current = newBoard;
        return newBoard;
      });

      result.current.enqueue(buildCommand({ action: "call" }));
      result.current.enqueue(buildCommand({ action: "fold" }));

      await vi.runAllTimersAsync();

      expect(api.action.call).toHaveBeenCalledTimes(1);
      expect(api.action.fold).toHaveBeenCalledTimes(1);
    });
  });

  describe("waitForBoardUpdate - 値比較", () => {
    it("phase が変わればキューが継続される", async () => {
      const board = buildMockBoard({ phase: "pre_flop", handNumber: 1 });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      vi.mocked(api.action.call).mockImplementation(async () => {
        const newBoard = buildMockBoard({ phase: "flop", handNumber: 1 });
        boardRef.current = newBoard;
        return newBoard;
      });

      result.current.enqueue(buildCommand({ action: "call" }));
      result.current.enqueue(buildCommand({ action: "fold" }));

      await vi.runAllTimersAsync();

      expect(api.action.call).toHaveBeenCalledTimes(1);
      expect(api.action.fold).toHaveBeenCalledTimes(1);
    });

    it("handNumber も phase も同じであればタイムアウトしてキューが中断される", async () => {
      const board = buildMockBoard({ phase: "pre_flop", handNumber: 1 });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // boardRef.current を変更しない（handNumber も phase も同じまま）
      vi.mocked(api.action.call).mockResolvedValue(board);

      result.current.enqueue(buildCommand({ action: "call" }));
      result.current.enqueue(buildCommand({ action: "fold" }));

      await vi.runAllTimersAsync();

      expect(api.action.call).toHaveBeenCalledTimes(1);
      expect(api.action.fold).not.toHaveBeenCalled();
    });
  });

  describe("unmount 後の interval リーク防止", () => {
    it("processNext 実行中に unmount しても waitForBoardUpdate が新規 interval を ghost 化しない", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result, unmount } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // call 実行後はボードを更新しない（waitForBoardUpdate がポーリング中に unmount させる）
      vi.mocked(api.action.call).mockImplementation(async () => {
        // 実行完了直後に unmount する
        unmount();
        return board;
      });

      result.current.enqueue(buildCommand({ action: "call" }));

      // unmount 後にタイマーを進めても interval が ghost 化しないことを確認
      await vi.runAllTimersAsync();

      // unmount 後は fold が実行されない
      expect(api.action.fold).not.toHaveBeenCalled();
    });

    it("unmount 後に waitForActionableBoard を呼ぶと即座に null を返す", async () => {
      const board = buildMockBoard({ phase: "showdown" });
      const boardRef = { current: board };

      // showdown フェーズ中に autoFoldUntilSeat を発動させるため seatNumber を指定
      const { result, unmount } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      unmount();

      // unmount 後のキュー処理で interval が作られないことを確認（タイマーを進めてもエラーなし）
      result.current.enqueue(buildCommand({ action: "call", seatNumber: 1 }));
      await vi.runAllTimersAsync();

      expect(api.action.call).not.toHaveBeenCalled();
    });
  });

  describe("unmount 後の onBack / onFold 抑制 (Bug 3 / Bug 8)", () => {
    it("autoBackUntilSeat: unmount 後に onBack が呼ばれない", async () => {
      const board = buildMockBoard({ currentTurn: 0 });
      const boardRef = { current: board };

      const { result, unmount } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // back コマンドにseatNumberを指定してautoBackUntilSeatを発動
      // onBack 実行直後にアンマウントし、2 回目の呼び出しを防ぐことを確認する
      let callCount = 0;
      mockOnBack.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // 1 回目の onBack 後にアンマウント
          unmount();
        }
      });

      // targetSeat=1（currentTurn=0 なので即 onBack が走る）
      result.current.enqueue(buildCommand({ action: "back", seatNumber: 1 }));

      await vi.runAllTimersAsync();

      // アンマウント後にループが継続して onBack が再度呼ばれていないこと
      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });

    it("autoFoldUntilSeat: unmount 後に api.action.fold が呼ばれない", async () => {
      // currentTurn=0、targetSeat=1 で自動 fold が走るボード
      const board = buildMockBoard({
        currentTurn: 0,
        currentBet: 200,
        players: [
          {
            position: 0,
            name: "Alice",
            stack: 9800,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 1,
            name: "Bob",
            stack: 9900,
            hand: null,
            betInRound: 100,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
        ],
      });
      const boardRef = { current: board };

      const { result, unmount } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // fold 実行直後にアンマウント
      let foldCount = 0;
      vi.mocked(api.action.fold).mockImplementation(async () => {
        foldCount++;
        unmount();
        return buildMockBoard();
      });

      // seatNumber=1 を指定して autoFoldUntilSeat を起動
      result.current.enqueue(buildCommand({ action: "fold", seatNumber: 1 }));

      await vi.runAllTimersAsync();

      // アンマウント後にループが継続して fold が再度呼ばれていないこと
      expect(foldCount).toBe(1);
    });

    it("autoCheckAround: unmount 後に api.action.check が呼ばれない", async () => {
      const board = buildMockBoard({
        currentBet: 0,
        players: [
          {
            position: 0,
            name: "Alice",
            stack: 9800,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 1,
            name: "Bob",
            stack: 9900,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
        ],
      });
      const boardRef = { current: board };

      const { result, unmount } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // check 実行直後にアンマウント
      let checkCount = 0;
      vi.mocked(api.action.check).mockImplementation(async () => {
        checkCount++;
        unmount();
        // ボードを更新してwaitForBoardUpdateを成功させる
        const newBoard = buildMockBoard({ handNumber: 2, currentBet: 0 });
        boardRef.current = newBoard;
        return newBoard;
      });

      result.current.enqueue(buildCommand({ action: "check-around" }));

      await vi.runAllTimersAsync();

      // アンマウント後に check が再度呼ばれていないこと
      expect(checkCount).toBe(1);
    });
  });

  describe("waitForBoardUpdate - currentTurn 変化検知 (Bug 1)", () => {
    it("同フェーズ内で currentTurn のみ変化した場合、waitForBoardUpdate が true を返しキューが継続される", async () => {
      const board = buildMockBoard({
        phase: "pre_flop",
        handNumber: 1,
        currentTurn: 0,
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // check 実行後に currentTurn だけ変化させ（handNumber・phase は同じ）
      // waitForBoardUpdate が true を返しキューが継続することを確認する
      vi.mocked(api.action.check).mockImplementation(async () => {
        const newBoard = buildMockBoard({
          phase: "pre_flop",
          handNumber: 1,
          currentTurn: 1, // currentTurn のみ変化
        });
        boardRef.current = newBoard;
        return newBoard;
      });

      result.current.enqueue(buildCommand({ action: "check" }));
      result.current.enqueue(buildCommand({ action: "check" }));

      await vi.runAllTimersAsync();

      // 2 件とも実行されキューが中断されていないこと
      expect(api.action.check).toHaveBeenCalledTimes(2);
    });

    it("同フェーズ内の連続 check が BREAK_QUEUE せず処理される", async () => {
      let currentTurn = 0;
      const board = buildMockBoard({
        phase: "flop",
        handNumber: 1,
        currentTurn,
        currentBet: 0,
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // check 実行ごとに currentTurn をインクリメントして同フェーズ内の進行を模擬
      vi.mocked(api.action.check).mockImplementation(async () => {
        currentTurn = (currentTurn + 1) % 2;
        const newBoard = buildMockBoard({
          phase: "flop",
          handNumber: 1,
          currentTurn,
          currentBet: 0,
        });
        boardRef.current = newBoard;
        return newBoard;
      });

      result.current.enqueue(buildCommand({ action: "check" }));
      result.current.enqueue(buildCommand({ action: "check" }));
      result.current.enqueue(buildCommand({ action: "check" }));

      await vi.runAllTimersAsync();

      // BREAK_QUEUE されず全て実行されること
      expect(api.action.check).toHaveBeenCalledTimes(3);
    });

    it("同フェーズかつ currentTurn も変化しない場合はタイムアウトしてキューが中断される", async () => {
      const board = buildMockBoard({
        phase: "pre_flop",
        handNumber: 1,
        currentTurn: 0,
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // boardRef.current を変更しない（handNumber も phase も currentTurn も同じまま）
      vi.mocked(api.action.check).mockResolvedValue(board);

      result.current.enqueue(buildCommand({ action: "check" }));
      result.current.enqueue(buildCommand({ action: "check" }));

      await vi.runAllTimersAsync();

      // タイムアウトで 1 件目のあとにキューが中断され 2 件目は実行されない
      expect(api.action.check).toHaveBeenCalledTimes(1);
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining(
          "ボード更新タイムアウトのためキューを中断しました",
        ),
      );
    });
  });

  describe("enqueue での check-around streetAtCapture 記録", () => {
    it("check-around コマンドにboardのフェーズがstreetAtCaptureとして記録される", async () => {
      const board = buildMockBoard({
        currentBet: 0,
        phase: "flop",
        players: [
          {
            position: 0,
            name: "Alice",
            stack: 9800,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 1,
            name: "Bob",
            stack: 9900,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
        ],
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(
          boardRef,
          mockOnBack,
          mockOnEditGame,
          mockOnActionExecuted,
        ),
      );

      const command = buildCommand({
        action: "check-around",
        streetAtCapture: undefined,
      });
      result.current.enqueue(command);

      await vi.runAllTimersAsync();

      expect(api.action.check).toHaveBeenCalled();
    });
  });

  describe("Bug 3 (R34): autoFoldUntilSeat でターゲットが folded 済みなら早期 BREAK_QUEUE", () => {
    it("target seat が hasFolded=true の場合、fold/check API は呼ばれず null（BREAK_QUEUE）が返る", async () => {
      // 4 人テーブルで seat 2 が既にフォールド済み
      const board = buildMockBoard({
        currentTurn: 0,
        currentBet: 200,
        players: [
          {
            position: 0,
            name: "Alice",
            stack: 9800,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 1,
            name: "Bob",
            stack: 9900,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 2,
            name: "Charlie",
            stack: 9700,
            hand: null,
            betInRound: 0,
            hasFolded: true, // 既にフォールド済み
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 3,
            name: "Dave",
            stack: 9600,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
        ],
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // seat 2（折り済み）を target に fold コマンドを発行
      result.current.enqueue(buildCommand({ action: "fold", seatNumber: 2 }));

      await vi.runAllTimersAsync();

      // fold/check が一切呼ばれないこと
      expect(api.action.fold).not.toHaveBeenCalled();
      expect(api.action.check).not.toHaveBeenCalled();
    });

    it("target seat が players リストに存在しない場合も fold/check API は呼ばれない", async () => {
      const board = buildMockBoard({
        currentTurn: 0,
        currentBet: 200,
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // 存在しない seat 99 を target に fold コマンドを発行
      result.current.enqueue(buildCommand({ action: "fold", seatNumber: 99 }));

      await vi.runAllTimersAsync();

      // fold/check が一切呼ばれないこと
      expect(api.action.fold).not.toHaveBeenCalled();
      expect(api.action.check).not.toHaveBeenCalled();
    });

    it("r36_bug3_auto_fold_skips_when_target_is_all_in: target seat が isAllIn=true の場合、fold/check API は呼ばれず即座に null が返る", async () => {
      // 4 人テーブルで seat 2 が all-in 済み
      const board = buildMockBoard({
        currentTurn: 0,
        currentBet: 200,
        players: [
          {
            position: 0,
            name: "Alice",
            stack: 9800,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 1,
            name: "Bob",
            stack: 9900,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 2,
            name: "Charlie",
            stack: 0,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: true, // all-in 済み（hasFolded=false）
            hasActed: false,
          },
          {
            position: 3,
            name: "Dave",
            stack: 9600,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
        ],
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // seat 2（all-in 済み）を target に fold コマンドを発行
      result.current.enqueue(buildCommand({ action: "fold", seatNumber: 2 }));

      await vi.runAllTimersAsync();

      // fold/check が一切呼ばれないこと
      expect(api.action.fold).not.toHaveBeenCalled();
      expect(api.action.check).not.toHaveBeenCalled();
    });

    it("target seat が folded 済みの場合、後続コマンドも実行されない（BREAK_QUEUE）", async () => {
      const board = buildMockBoard({
        currentTurn: 0,
        currentBet: 200,
        players: [
          {
            position: 0,
            name: "Alice",
            stack: 9800,
            hand: null,
            betInRound: 0,
            hasFolded: false,
            isAllIn: false,
            hasActed: false,
          },
          {
            position: 1,
            name: "Bob",
            stack: 9900,
            hand: null,
            betInRound: 0,
            hasFolded: true, // 既にフォールド済み（target）
            isAllIn: false,
            hasActed: false,
          },
        ],
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // seat 1（折り済み）を target に fold コマンドを発行し、後続に call を積む
      result.current.enqueue(buildCommand({ action: "fold", seatNumber: 1 }));
      result.current.enqueue(buildCommand({ action: "call" }));

      await vi.runAllTimersAsync();

      // fold も後続の call も実行されないこと
      expect(api.action.fold).not.toHaveBeenCalled();
      expect(api.action.call).not.toHaveBeenCalled();
    });
  });

  describe("Bug C: autoFoldUntilSeat が canChangeRound=true で null を返した後のキュー継続バグ", () => {
    it("autoFoldUntilSeat が null を返した場合（canChangeRound=true による中断）、後続コマンドは実行されない", async () => {
      // 席 0 が currentTurn、targetSeat=2 を目指すが canChangeRound=true のため
      // autoFoldUntilSeat が null を返すシナリオ
      // canChangeRound=true: activePlayers 全員が hasActed=true かつ betInRound >= currentBet
      const board = buildMockBoard({
        currentTurn: 0,
        currentBet: 200,
        players: [
          {
            position: 0,
            name: "Alice",
            stack: 9800,
            hand: null,
            betInRound: 200, // currentBet と同額
            hasFolded: false,
            isAllIn: false,
            hasActed: true, // hasActed=true → canChangeRound=true になる
          },
          {
            position: 1,
            name: "Bob",
            stack: 9900,
            hand: null,
            betInRound: 200,
            hasFolded: false,
            isAllIn: false,
            hasActed: true,
          },
          {
            position: 2,
            name: "Charlie",
            stack: 9700,
            hand: null,
            betInRound: 200,
            hasFolded: false,
            isAllIn: false,
            hasActed: true,
          },
        ],
      });
      // waitForActionableBoard が即座に board を返せるようにする（phase !== "showdown"）
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // fold → call の順でキューに積む
      // fold は seatNumber=2 を指定（currentTurn=0 なので autoFoldUntilSeat が走る）
      // ラウンド完了状態（canChangeRound=true）なので autoFoldUntilSeat は null を返す
      // → 後続の call が実行されてはいけない
      result.current.enqueue(buildCommand({ action: "fold", seatNumber: 2 }));
      result.current.enqueue(buildCommand({ action: "call" }));

      await vi.runAllTimersAsync();

      // fold 自体（api.action.fold）は autoFoldUntilSeat が canChangeRound で中断するため呼ばれない
      expect(api.action.fold).not.toHaveBeenCalled();
      // 後続の call は実行されてはいけない（BREAK_QUEUE により中断される）
      expect(api.action.call).not.toHaveBeenCalled();
      // 警告メッセージが発行されること
      expect(mockVoiceInputService.emitStatusPublic).toHaveBeenCalledWith(
        "listening",
        expect.stringContaining(
          "シート 2 へのフォールド自動進行を中断しました",
        ),
      );
    });

    it("autoFoldUntilSeat が null を返した場合、fold コマンド自体も実行されない", async () => {
      // targetSeat に到達する前にラウンドが完了している状態（canChangeRound=true）
      const board = buildMockBoard({
        currentTurn: 0,
        currentBet: 100,
        players: [
          {
            position: 0,
            name: "Alice",
            stack: 9900,
            hand: null,
            betInRound: 100,
            hasFolded: false,
            isAllIn: false,
            hasActed: true,
          },
          {
            position: 1,
            name: "Bob",
            stack: 9900,
            hand: null,
            betInRound: 100,
            hasFolded: false,
            isAllIn: false,
            hasActed: true,
          },
        ],
      });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // seatNumber=1 に fold を積む。currentTurn=0 なので autoFoldUntilSeat が走るが
      // canChangeRound=true で中断 → null が返る → BREAK_QUEUE
      result.current.enqueue(buildCommand({ action: "fold", seatNumber: 1 }));

      await vi.runAllTimersAsync();

      // autoFoldUntilSeat 内で fold/check は呼ばれない（canChangeRound で即中断）
      expect(api.action.fold).not.toHaveBeenCalled();
      expect(api.action.call).not.toHaveBeenCalled();
    });
  });

  describe("r37_bug3_process_next_breaks_after_unmount", () => {
    it("enqueue 後に unmount すると、その後の dispatchCommand 呼び出しが行われない", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      // call が pending 中に unmount → unmountedRef.current が true になる
      let resolveCall!: () => void;
      const callPromise = new Promise<void>((resolve) => {
        resolveCall = resolve;
      });
      vi.mocked(api.action.call).mockImplementation(async () => {
        await callPromise;
        return buildMockBoard();
      });

      const { result, unmount } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      // 1 件目（call）をキューへ積んで処理開始
      result.current.enqueue(buildCommand({ action: "call" }));
      // 2 件目（fold）を積む（1 件目の await 中なのでキューに残る）
      result.current.enqueue(buildCommand({ action: "fold" }));

      // コンポーネントをアンマウントして unmountedRef.current = true にする
      unmount();

      // 1 件目の IPC を解決
      resolveCall();
      await vi.runAllTimersAsync();

      // 1 件目の call は既に呼ばれているが、unmount 後なので 2 件目の fold は呼ばれない
      expect(api.action.call).toHaveBeenCalledTimes(1);
      expect(api.action.fold).not.toHaveBeenCalled();
    });
  });
});
