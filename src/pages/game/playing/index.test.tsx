import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import type { TexasHoldemBoard } from "../../../types";
import { GamePlaying } from "./index";

// api/client を mock
vi.mock("../../../api/client", () => ({
  api: {
    board: {
      backBoard: vi.fn(),
      moveNextGame: vi.fn(),
      resetBoard: vi.fn(),
      updatePlayer: vi.fn(),
      addPlayer: vi.fn(),
      removePlayer: vi.fn(),
    },
    action: {
      call: vi.fn(),
      check: vi.fn(),
      fold: vi.fn(),
      bet: vi.fn(),
      raise: vi.fn(),
      allin: vi.fn(),
    },
    gameSettings: {
      load: vi.fn(() =>
        Promise.resolve({
          smallBlind: 100,
          bigBlind: 200,
          minChip: 100,
          bbAnte: false,
        }),
      ),
      save: vi.fn(),
    },
  },
}));

// react-router の useNavigate を mock
const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// board_context を mock
let mockBoard: TexasHoldemBoard | null = null;
const mockRefresh = vi.fn();
vi.mock("../../../contexts/board_context", () => ({
  useBoard: () => ({
    board: mockBoard,
    loading: false,
    refresh: mockRefresh,
  }),
}));

// Page コンポーネントをスタブ化（重い子コンポーネントの依存を回避）
vi.mock("./page", () => ({
  Page: ({
    board,
    actionProps,
    resetConfirmProps,
    onBackAction,
    onNextGame,
    onRequestBet,
    onRequestRaise,
    disabledActionTypes,
    isShowdown,
    onAddPlayer,
    isAddPlayerDisabled,
  }: {
    board: TexasHoldemBoard;
    actionProps: {
      onCall: () => Promise<void>;
      onCheck: () => Promise<void>;
      onFold: () => Promise<void>;
      onBet: (amount: number) => Promise<void>;
      onRaise: (amount: number) => Promise<void>;
      onAllIn: () => Promise<void>;
    };
    resetConfirmProps: {
      isOpen: boolean;
      onOpenClick: () => void;
      onConfirmClick: () => void;
      onCloseClick: () => void;
    };
    onBackAction: () => void;
    onNextGame: () => void;
    onRequestBet: () => void;
    onRequestRaise: () => void;
    disabledActionTypes: string[];
    isShowdown: boolean;
    onAddPlayer: () => void;
    isAddPlayerDisabled: boolean;
  }) => (
    <div data-testid="game-page">
      <div data-testid="board-phase">{board.phase}</div>
      {board.players.map((p) => (
        <div key={p.position} data-testid={`player-${p.position}`}>
          <span data-testid={`player-name-${p.position}`}>{p.name}</span>
          <span data-testid={`player-stack-${p.position}`}>{p.stack}</span>
        </div>
      ))}
      <div data-testid="community-cards-count">
        {board.communityCards.length}
      </div>
      {!disabledActionTypes.includes("fold") && (
        <button
          type="button"
          data-testid="btn-fold"
          onClick={() => actionProps.onFold()}
        >
          FOLD
        </button>
      )}
      {!disabledActionTypes.includes("call") && (
        <button
          type="button"
          data-testid="btn-call"
          onClick={() => actionProps.onCall()}
        >
          CALL
        </button>
      )}
      {!disabledActionTypes.includes("check") && (
        <button
          type="button"
          data-testid="btn-check"
          onClick={() => actionProps.onCheck()}
        >
          CHECK
        </button>
      )}
      {!disabledActionTypes.includes("bet") && (
        <button type="button" data-testid="btn-bet" onClick={onRequestBet}>
          BET
        </button>
      )}
      {!disabledActionTypes.includes("raise") && (
        <button type="button" data-testid="btn-raise" onClick={onRequestRaise}>
          RAISE
        </button>
      )}
      {!disabledActionTypes.includes("allin") && (
        <button
          type="button"
          data-testid="btn-allin"
          onClick={() => actionProps.onAllIn()}
        >
          ALL-IN
        </button>
      )}
      {isShowdown && (
        <button type="button" data-testid="btn-next-game" onClick={onNextGame}>
          NEXT GAME
        </button>
      )}
      <button type="button" data-testid="btn-back" onClick={onBackAction}>
        BACK
      </button>
      <button
        type="button"
        data-testid="btn-reset-open"
        onClick={resetConfirmProps.onOpenClick}
      >
        RESET
      </button>
      {resetConfirmProps.isOpen && (
        <button
          type="button"
          data-testid="btn-reset-confirm"
          onClick={resetConfirmProps.onConfirmClick}
        >
          はい
        </button>
      )}
      <button
        type="button"
        data-testid="btn-add-player"
        onClick={onAddPlayer}
        disabled={isAddPlayerDisabled}
      >
        + プレイヤー
      </button>
    </div>
  ),
}));

// BET モーダルをスタブ化（確定ボタン押下で onConfirm を呼ぶ）
vi.mock("./components/bet_amount_modal", () => ({
  BetAmountModal: ({
    type,
    onConfirm,
    onCancel,
  }: {
    type: "BET" | "RAISE";
    onConfirm: (amount: number) => void;
    onCancel: () => void;
  }) => (
    <div data-testid={`modal-${type}`}>
      <button
        type="button"
        data-testid={`modal-${type}-confirm`}
        onClick={() => onConfirm(500)}
      >
        confirm
      </button>
      <button
        type="button"
        data-testid={`modal-${type}-cancel`}
        onClick={onCancel}
      >
        cancel
      </button>
    </div>
  ),
}));

vi.mock("./components/edit_community_card_modal", () => ({
  EditCommunityCardModal: () => <div data-testid="modal-edit-cc" />,
}));

vi.mock("./components/add_player_modal", () => ({
  AddPlayerModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="modal-add-player">
      <button
        type="button"
        data-testid="modal-add-player-cancel"
        onClick={onClose}
      >
        cancel
      </button>
    </div>
  ),
}));

vi.mock("./components/player_edit_modal", () => ({
  PlayerEditModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="modal-player-edit">
      <button
        type="button"
        data-testid="modal-player-edit-cancel"
        onClick={onClose}
      >
        cancel
      </button>
    </div>
  ),
}));

// useCardPlacedHandler は RFID ハードウェアに依存するためテストでは no-op にする
vi.mock("./hooks/useCardPlacedHandler", () => ({
  useCardPlacedHandler: () => ({
    eventHistory: [],
    clearEventHistory: vi.fn(),
  }),
}));

const makeBoard = (
  override: Partial<TexasHoldemBoard> = {},
): TexasHoldemBoard => ({
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
});

const renderGamePlaying = () =>
  render(
    <MemoryRouter>
      <GamePlaying />
    </MemoryRouter>,
  );

describe("GamePlaying", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBoard = null;
    mockRefresh.mockResolvedValue(undefined);
    vi.mocked(api.board.backBoard).mockResolvedValue(makeBoard());
    vi.mocked(api.board.moveNextGame).mockResolvedValue(makeBoard());
    vi.mocked(api.board.resetBoard).mockResolvedValue(undefined);
    vi.mocked(api.action.call).mockResolvedValue(makeBoard());
    vi.mocked(api.action.check).mockResolvedValue(makeBoard());
    vi.mocked(api.action.fold).mockResolvedValue(makeBoard());
    vi.mocked(api.action.bet).mockResolvedValue(makeBoard());
    vi.mocked(api.action.raise).mockResolvedValue(makeBoard());
    vi.mocked(api.action.allin).mockResolvedValue(makeBoard());
  });

  describe("board が null の場合", () => {
    it("「ゲームが開始されていません」というメッセージが表示される", () => {
      mockBoard = null;
      renderGamePlaying();

      expect(
        screen.getByText("ゲームが開始されていません"),
      ).toBeInTheDocument();
    });

    it("Page コンポーネントは表示されない", () => {
      mockBoard = null;
      renderGamePlaying();

      expect(screen.queryByTestId("game-page")).not.toBeInTheDocument();
    });
  });

  describe("board がセットされている場合", () => {
    it("プレイヤー名が表示される", () => {
      mockBoard = makeBoard();
      renderGamePlaying();

      expect(screen.getByTestId("player-name-0")).toHaveTextContent("Alice");
      expect(screen.getByTestId("player-name-1")).toHaveTextContent("Bob");
    });

    it("プレイヤーのスタックが表示される", () => {
      mockBoard = makeBoard();
      renderGamePlaying();

      expect(screen.getByTestId("player-stack-0")).toHaveTextContent("9800");
      expect(screen.getByTestId("player-stack-1")).toHaveTextContent("9900");
    });

    it("コミュニティカード数が表示される（フロップ前は0枚）", () => {
      mockBoard = makeBoard({ communityCards: [] });
      renderGamePlaying();

      expect(screen.getByTestId("community-cards-count")).toHaveTextContent(
        "0",
      );
    });

    it("コミュニティカードがある場合に枚数が正しく表示される", () => {
      mockBoard = makeBoard({
        phase: "flop",
        communityCards: [
          { suit: "spade", value: "A" },
          { suit: "heart", value: "K" },
          { suit: "diamond", value: "Q" },
        ],
      });
      renderGamePlaying();

      expect(screen.getByTestId("community-cards-count")).toHaveTextContent(
        "3",
      );
    });

    it("フェーズが表示される", () => {
      mockBoard = makeBoard({ phase: "pre_flop" });
      renderGamePlaying();

      expect(screen.getByTestId("board-phase")).toHaveTextContent("pre_flop");
    });
  });

  describe("アクションボタン", () => {
    it("FOLD ボタンをクリックすると api.action.fold() が呼ばれる", async () => {
      const user = userEvent.setup();
      mockBoard = makeBoard();
      renderGamePlaying();

      const foldButton = screen.getByTestId("btn-fold");
      await user.click(foldButton);

      await waitFor(() => {
        expect(api.action.fold).toHaveBeenCalledTimes(1);
      });
    });

    it("CALL ボタンをクリックすると api.action.call() が呼ばれる", async () => {
      const user = userEvent.setup();
      mockBoard = makeBoard();
      renderGamePlaying();

      const callButton = screen.getByTestId("btn-call");
      await user.click(callButton);

      await waitFor(() => {
        expect(api.action.call).toHaveBeenCalledTimes(1);
      });
    });

    it("BET ボタンをクリックするとモーダルが開き、確定で api.action.bet() が呼ばれる", async () => {
      const user = userEvent.setup();
      // currentBet=0 で BET 有効（チェック後の状態を想定）
      mockBoard = makeBoard({ currentBet: 0 });
      renderGamePlaying();

      const betButton = screen.getByTestId("btn-bet");
      await user.click(betButton);

      // モーダルが描画される
      const modal = await screen.findByTestId("modal-BET");
      expect(modal).toBeInTheDocument();

      // 確定で bet が呼ばれる
      const confirm = screen.getByTestId("modal-BET-confirm");
      await user.click(confirm);

      await waitFor(() => {
        expect(api.action.bet).toHaveBeenCalledWith(500);
      });
    });

    it("RAISE ボタンをクリックするとモーダルが開き、確定で api.action.raise() が呼ばれる", async () => {
      const user = userEvent.setup();
      mockBoard = makeBoard();
      renderGamePlaying();

      const raiseButton = screen.getByTestId("btn-raise");
      await user.click(raiseButton);

      const modal = await screen.findByTestId("modal-RAISE");
      expect(modal).toBeInTheDocument();

      const confirm = screen.getByTestId("modal-RAISE-confirm");
      await user.click(confirm);

      await waitFor(() => {
        expect(api.action.raise).toHaveBeenCalledWith(500);
      });
    });

    it("ALL-IN ボタンをクリックすると api.action.allin() が呼ばれる", async () => {
      const user = userEvent.setup();
      mockBoard = makeBoard();
      renderGamePlaying();

      const allinButton = screen.getByTestId("btn-allin");
      await user.click(allinButton);

      await waitFor(() => {
        expect(api.action.allin).toHaveBeenCalledTimes(1);
      });
    });

    it("アクション後に refresh が呼ばれる", async () => {
      const user = userEvent.setup();
      mockBoard = makeBoard();
      renderGamePlaying();

      const foldButton = screen.getByTestId("btn-fold");
      await user.click(foldButton);

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled();
      });
    });
  });

  describe("showdown フェーズ", () => {
    it("showdown 時にアクションボタンが表示されない", () => {
      mockBoard = makeBoard({ phase: "showdown" });
      renderGamePlaying();

      expect(screen.queryByTestId("btn-fold")).not.toBeInTheDocument();
      expect(screen.queryByTestId("btn-call")).not.toBeInTheDocument();
      expect(screen.queryByTestId("btn-bet")).not.toBeInTheDocument();
    });

    it("showdown 時に NEXT GAME ボタンが表示される", () => {
      mockBoard = makeBoard({ phase: "showdown" });
      renderGamePlaying();

      expect(screen.getByTestId("btn-next-game")).toBeInTheDocument();
    });

    it("NEXT GAME ボタンをクリックすると '/game/next-game' に navigate する", async () => {
      const user = userEvent.setup();
      mockBoard = makeBoard({ phase: "showdown" });
      renderGamePlaying();

      const nextGameButton = screen.getByTestId("btn-next-game");
      await user.click(nextGameButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/game/next-game");
      });
    });
  });

  describe("BACK / RESET", () => {
    it("BACK ボタンをクリックすると api.board.backBoard() が呼ばれる", async () => {
      const user = userEvent.setup();
      mockBoard = makeBoard();
      renderGamePlaying();

      const backButton = screen.getByTestId("btn-back");
      await user.click(backButton);

      await waitFor(() => {
        expect(api.board.backBoard).toHaveBeenCalledTimes(1);
      });
    });

    it("RESET 確認をクリックすると api.board.resetBoard() が呼ばれ navigate('/game/setting') される", async () => {
      const user = userEvent.setup();
      mockBoard = makeBoard();
      renderGamePlaying();

      // RESET ボタンを開く
      const resetButton = screen.getByTestId("btn-reset-open");
      await user.click(resetButton);

      // 確認ボタンをクリック
      const confirmButton = screen.getByTestId("btn-reset-confirm");
      await user.click(confirmButton);

      await waitFor(() => {
        expect(api.board.resetBoard).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/game/setting");
      });
    });
  });
});
