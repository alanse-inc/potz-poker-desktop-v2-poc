import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import { DeckEdit } from "./index";

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
      getDeckById: vi.fn(),
      saveDeck: vi.fn(),
    },
    rfid: {
      setRegisterMode: vi.fn(),
    },
    notifications: {
      onCardPlacedRegister: vi.fn(),
    },
  },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const mockDeck = {
  id: "deck-1",
  name: "Test Deck",
  cards: { RFID001: { suit: "spade" as const, value: "A" as const } },
};

describe("DeckEdit", () => {
  beforeEach(() => {
    vi.mocked(api.deck.getDeckById).mockResolvedValue(mockDeck);
    vi.mocked(api.deck.saveDeck).mockResolvedValue({
      ...mockDeck,
      name: "Updated Deck",
    });
    vi.mocked(api.rfid.setRegisterMode).mockResolvedValue(undefined);
    vi.mocked(api.notifications.onCardPlacedRegister).mockResolvedValue(
      vi.fn(),
    );
    mockNavigate.mockReset();
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={["/deck/edit/deck-1"]}>
        <Routes>
          <Route path="/deck/edit/:id" element={<DeckEdit />} />
        </Routes>
      </MemoryRouter>,
    );

  it("「デッキ編集」見出しが表示される", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("デッキ編集")).toBeInTheDocument();
    });
  });

  it("デッキ名が input に表示される", async () => {
    renderPage();
    await waitFor(() => {
      const input = screen.getByPlaceholderText("デッキ名");
      expect(input).toHaveValue("Test Deck");
    });
  });

  it("カードグリッドが表示される", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("デッキ編集")).toBeInTheDocument();
    });
    // スペードのA - 13枚分の列が表示されていることを確認
    const suits = ["♠", "♥", "♦", "♣"];
    for (const suit of suits) {
      expect(screen.getAllByText(suit).length).toBeGreaterThan(0);
    }
  });

  it("名前保存ボタンをクリックすると saveDeck が呼ばれる", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByPlaceholderText("デッキ名"));

    const input = screen.getByPlaceholderText("デッキ名");
    await user.clear(input);
    await user.type(input, "Updated Deck");

    const saveBtn = screen.getByText("保存");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(api.deck.saveDeck).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Updated Deck" }),
      );
    });
  });

  it("「戻る」ボタンをクリックすると /deck/choose に navigate する", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText("戻る"));

    await user.click(screen.getByText("戻る"));

    expect(mockNavigate).toHaveBeenCalledWith("/deck/choose");
  });
});
