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
const mockTrackClientSideError = vi.mocked(trackClientSideError);
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
    it("isProcessing 中は二重処理しない", async () => {
      const board = buildMockBoard();
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

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

      result.current.enqueue(
        buildCommand({ action: "fold", confidence: 0.5 }),
      );

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

      result.current.enqueue(
        buildCommand({ action: "bet", amount: null }),
      );
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

      result.current.enqueue(
        buildCommand({ action: "raise", amount: null }),
      );
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

      result.current.enqueue(
        buildCommand({ action: null, amount: 500 }),
      );
      await vi.runAllTimersAsync();

      expect(api.action.raise).toHaveBeenCalledWith(500);
    });

    it("action=null かつ amount あり → currentBet === 0 なら bet に解決される", async () => {
      const board = buildMockBoard({ currentBet: 0 });
      const boardRef = { current: board };

      const { result } = renderHook(() =>
        useVoiceCommandQueue(boardRef, mockOnBack, mockOnEditGame),
      );

      result.current.enqueue(
        buildCommand({ action: null, amount: 300 }),
      );
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
});
