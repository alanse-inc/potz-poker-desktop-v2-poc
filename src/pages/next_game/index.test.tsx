import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { TexasHoldemBoard } from "../../types";
import { NextGame } from "./index";

// api/client を mock
vi.mock("../../api/client", () => ({
  api: {
    board: {
      moveNextGame: vi.fn(),
      updatePlayer: vi.fn(),
      addPlayer: vi.fn(),
      removePlayer: vi.fn(),
    },
  },
}));

// useAutoScale を mock（ResizeObserver が jsdom で未定義のため）
vi.mock("../../hooks/useAutoScale", () => ({
  useAutoScale: () => ({
    containerRef: { current: null },
    contentRef: { current: null },
  }),
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
vi.mock("../../contexts/board_context", () => ({
  useBoard: () => ({
    board: mockBoard,
    loading: false,
    refresh: mockRefresh,
  }),
}));

// PlayerEditModal をスタブ化
vi.mock("../../features/modal/player_edit_modal", () => ({
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

// AddPlayerModal をスタブ化
vi.mock("../game/playing/components/add_player_modal", () => ({
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

const makeBoard = (
  override: Partial<TexasHoldemBoard> = {},
): TexasHoldemBoard => ({
  handNumber: 3,
  dealerPosition: 0,
  sbPosition: 1,
  bbPosition: 2,
  currentTurn: 0,
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
  communityCards: [],
  pots: [{ amount: 0 }],
  phase: "showdown",
  winners: [],
  ...override,
});

const renderNextGame = () =>
  render(
    <MemoryRouter>
      <NextGame />
    </MemoryRouter>,
  );

describe("NextGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBoard = null;
    mockRefresh.mockResolvedValue(undefined);
    vi.mocked(api.board.moveNextGame).mockResolvedValue(makeBoard());
  });

  it("プレイヤー名が表示される", () => {
    mockBoard = makeBoard();
    renderNextGame();

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("次のハンド番号 (Hand #) が表示される", () => {
    mockBoard = makeBoard({ handNumber: 3 });
    renderNextGame();

    // Hand #4 (handNumber + 1) が表示される
    expect(screen.getByText("Hand #4")).toBeInTheDocument();
  });

  it("NEXT GAME ボタンをクリックすると moveNextGame が呼ばれ navigate('/game/playing') する", async () => {
    const user = userEvent.setup();
    mockBoard = makeBoard();
    renderNextGame();

    const nextGameButton = screen.getByText("NEXT GAME");
    await user.click(nextGameButton);

    await waitFor(() => {
      expect(api.board.moveNextGame).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/game/playing");
    });
  });

  it("BACK ボタンをクリックすると '/game/playing' に navigate する", async () => {
    const user = userEvent.setup();
    mockBoard = makeBoard();
    renderNextGame();

    const backButton = screen.getByText("BACK");
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith("/game/playing");
  });

  it("参加人数が表示される", () => {
    mockBoard = makeBoard();
    renderNextGame();

    expect(screen.getByText("2 人参加中")).toBeInTheDocument();
  });
});
