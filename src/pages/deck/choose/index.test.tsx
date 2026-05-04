import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import { DeckChoose } from "./index";

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../../api/client", () => ({
  api: {
    deck: {
      getAllDecks: vi.fn(),
      getCurrentDeck: vi.fn(),
      chooseDeck: vi.fn(),
      deleteDeck: vi.fn(),
      saveDeck: vi.fn(),
    },
  },
}));

const mockDeckA = {
  id: "deck-a",
  name: "Deck A",
  cards: { RFID1: { suit: "spade", value: "A" } },
};
const mockDeckB = { id: "deck-b", name: "Deck B", cards: {} };

describe("DeckChoose", () => {
  beforeEach(() => {
    vi.mocked(api.deck.getAllDecks).mockResolvedValue([mockDeckA, mockDeckB]);
    vi.mocked(api.deck.getCurrentDeck).mockResolvedValue(mockDeckA);
    vi.mocked(api.deck.chooseDeck).mockResolvedValue(undefined);
    vi.mocked(api.deck.deleteDeck).mockResolvedValue(undefined);
    vi.mocked(api.deck.saveDeck).mockResolvedValue({
      id: "new-id",
      name: "New Deck",
      cards: {},
    });
    mockNavigate.mockReset();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <DeckChoose />
      </MemoryRouter>,
    );

  it("「デッキ選択」見出しが表示される", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("デッキ選択")).toBeInTheDocument();
    });
  });

  it("デッキ一覧が表示される", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Deck A")).toBeInTheDocument();
      expect(screen.getByText("Deck B")).toBeInTheDocument();
    });
  });

  it("選択ボタンをクリックすると chooseDeck が呼ばれ /deck に navigate する", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText("Deck A"));

    const buttons = screen.getAllByText("選択");
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(api.deck.chooseDeck).toHaveBeenCalledWith("deck-a");
      expect(mockNavigate).toHaveBeenCalledWith("/deck");
    });
  });

  it("削除ボタンをクリックすると deleteDeck が呼ばれる", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText("Deck A"));

    // 2枚デッキがあるので削除可能
    const buttons = screen.getAllByText("削除");
    await user.click(buttons[1]);

    await waitFor(() => {
      expect(api.deck.deleteDeck).toHaveBeenCalledWith("deck-b");
    });
  });

  it("「新しいデッキを作成」ボタンでモーダルが表示される", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText("新しいデッキを作成"));

    await user.click(screen.getByText("新しいデッキを作成"));

    expect(screen.getByText("新しいデッキ名")).toBeInTheDocument();
  });

  it("「戻る」ボタンをクリックすると /deck に navigate する", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText("戻る"));

    await user.click(screen.getByText("戻る"));

    expect(mockNavigate).toHaveBeenCalledWith("/deck");
  });

  it("デッキが空の場合はメッセージが表示される", async () => {
    vi.mocked(api.deck.getAllDecks).mockResolvedValue([]);
    vi.mocked(api.deck.getCurrentDeck).mockResolvedValue(null);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(
          "デッキがありません。新しいデッキを作成してください。",
        ),
      ).toBeInTheDocument();
    });
  });
});
