import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelectBtn } from "./index";

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockStartGame = vi.fn();
vi.mock("../../../api/client", () => ({
  api: {
    board: {
      startGame: (...args: unknown[]) => mockStartGame(...args),
    },
  },
}));

const mockRefresh = vi.fn();
vi.mock("../../../contexts/board_context", () => ({
  useBoard: () => ({
    board: null,
    loading: false,
    refresh: mockRefresh,
  }),
}));

vi.mock("../../../hooks/useAutoScale", () => ({
  useAutoScale: () => ({
    containerRef: { current: null },
    contentRef: { current: null },
  }),
}));

const renderWithState = (state: unknown) => {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/game/select-btn", state }]}>
      <Routes>
        <Route path="/game/select-btn" element={<SelectBtn />} />
      </Routes>
    </MemoryRouter>,
  );
};

const defaultState = {
  smallBlind: 100,
  bigBlind: 200,
  minChip: 100,
  bbAnte: false,
  playerNames: ["Alice", "Bob", "Carol"],
};

describe("SelectBtn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartGame.mockReset();
  });

  it("プレイヤー名がボード上に表示される", () => {
    renderWithState(defaultState);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("初期状態では position=0 が BTN として選択されている", () => {
    renderWithState(defaultState);
    const btnBadges = screen.getAllByText("BTN");
    expect(btnBadges.length).toBe(1);
  });

  it("プレイヤーボタンをクリックすると BTN がそのプレイヤーに切り替わる", async () => {
    const user = userEvent.setup();
    renderWithState(defaultState);
    await user.click(screen.getByText("Bob"));
    await waitFor(() => {
      expect(screen.getAllByText("BTN").length).toBe(1);
    });
  });

  it("「ゲーム開始」ボタンを押すと startGame が呼ばれて /game/playing に navigate される", async () => {
    const user = userEvent.setup();
    mockStartGame.mockResolvedValueOnce(undefined);
    renderWithState(defaultState);

    await user.click(screen.getByText("Bob"));
    await user.click(screen.getByText("ゲーム開始"));

    await waitFor(() => {
      expect(mockStartGame).toHaveBeenCalledWith({
        smallBlind: 100,
        bigBlind: 200,
        minChip: 100,
        bbAnte: false,
        playerNames: ["Alice", "Bob", "Carol"],
        dealerPosition: 1,
      });
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/game/playing");
    });
  });

  it("「BACK」ボタンを押すと navigate(-1) が呼ばれる", async () => {
    const user = userEvent.setup();
    renderWithState(defaultState);
    await user.click(screen.getByText("BACK"));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("state がない場合は /game/setting にリダイレクトされる", async () => {
    renderWithState(null);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/game/setting", {
        replace: true,
      });
    });
  });
});
