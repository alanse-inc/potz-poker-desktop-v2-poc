import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { Debug } from "./index";

vi.mock("../../api/client", () => ({
  api: {
    board: { getBoard: vi.fn() },
    gameSettings: { load: vi.fn() },
    rfid: {
      getMapping: vi.fn(),
      getSerialStatus: vi.fn(),
      applyCardPlaced: vi.fn(),
    },
    deck: {
      getCurrentDeck: vi.fn(),
      getAllDecks: vi.fn(),
    },
    telop: {
      getState: vi.fn(),
    },
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(""),
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderDebug = () =>
  render(
    <MemoryRouter>
      <Debug />
    </MemoryRouter>,
  );

describe("Debug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.board.getBoard).mockResolvedValue(null);
    vi.mocked(api.gameSettings.load).mockResolvedValue({
      smallBlind: 100,
      bigBlind: 200,
      minChip: 100,
      bbAnte: false,
    });
    vi.mocked(api.rfid.getMapping).mockResolvedValue({
      id: "test",
      name: "test",
      cards: {},
    });
    vi.mocked(api.rfid.getSerialStatus).mockResolvedValue({
      connected: false,
      portName: null,
    });
    vi.mocked(api.rfid.applyCardPlaced).mockResolvedValue(undefined);
    vi.mocked(api.deck.getCurrentDeck).mockResolvedValue(null);
    vi.mocked(api.deck.getAllDecks).mockResolvedValue([]);
    vi.mocked(api.telop.getState).mockResolvedValue({
      message: "",
      color: "#fff",
    });
  });

  it("「デバッグメニュー」の見出しが表示される", () => {
    renderDebug();
    expect(screen.getByText("デバッグメニュー")).toBeInTheDocument();
  });

  it("「リフレッシュ」ボタンが表示される", async () => {
    renderDebug();
    await waitFor(() => {
      expect(screen.getByText("リフレッシュ")).toBeInTheDocument();
    });
  });

  it("「Ping ボード」「card_placed テスト発火」ボタンが表示される", () => {
    renderDebug();
    expect(screen.getByText("Ping ボード")).toBeInTheDocument();
    expect(screen.getByText("card_placed テスト発火")).toBeInTheDocument();
  });

  it("マウント時に各 API が呼ばれる", async () => {
    renderDebug();
    await waitFor(() => {
      expect(api.board.getBoard).toHaveBeenCalledTimes(1);
      expect(api.gameSettings.load).toHaveBeenCalledTimes(1);
      expect(api.rfid.getMapping).toHaveBeenCalledTimes(1);
      expect(api.rfid.getSerialStatus).toHaveBeenCalledTimes(1);
    });
  });

  it("シリアル未接続のとき「未接続」が表示される", async () => {
    renderDebug();
    await waitFor(() => {
      expect(screen.getByText("未接続")).toBeInTheDocument();
    });
  });

  it("シリアル接続済みのときポート名が表示される", async () => {
    vi.mocked(api.rfid.getSerialStatus).mockResolvedValue({
      connected: true,
      portName: "/dev/tty.usbmodem1234",
    });
    renderDebug();
    await waitFor(() => {
      expect(
        screen.getByText("接続中: /dev/tty.usbmodem1234"),
      ).toBeInTheDocument();
    });
  });

  it("ボード null のとき「null (ゲーム未開始)」が表示される", async () => {
    renderDebug();
    await waitFor(() => {
      expect(screen.getByText("null (ゲーム未開始)")).toBeInTheDocument();
    });
  });

  it("「戻る」ボタンをクリックすると navigate('/') が呼ばれる", async () => {
    const user = userEvent.setup();
    renderDebug();
    await user.click(screen.getByText("戻る"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("「Ping ボード」をクリックすると getBoard が再度呼ばれる", async () => {
    const user = userEvent.setup();
    renderDebug();
    await waitFor(() => {
      expect(api.board.getBoard).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByText("Ping ボード"));
    await waitFor(() => {
      expect(api.board.getBoard).toHaveBeenCalledTimes(2);
    });
  });

  describe("全機能スモークテスト", () => {
    it("初期表示で 8 ステップが WAIT 状態で並ぶ", async () => {
      renderDebug();
      await waitFor(() => {
        expect(screen.getByText("全機能スモークテスト")).toBeInTheDocument();
      });
      expect(screen.getByText("board.getBoard")).toBeInTheDocument();
      expect(screen.getByText("gameSettings.load")).toBeInTheDocument();
      expect(screen.getByText("rfid.getMapping")).toBeInTheDocument();
      expect(screen.getByText("rfid.getSerialStatus")).toBeInTheDocument();
      expect(screen.getByText("deck.getCurrentDeck")).toBeInTheDocument();
      expect(screen.getByText("deck.getAllDecks")).toBeInTheDocument();
      expect(screen.getByText("telop.getState")).toBeInTheDocument();
      expect(screen.getByText("get_table_name")).toBeInTheDocument();
      expect(screen.getAllByText("WAIT").length).toBe(8);
    });

    it("実行ボタンをクリックすると全 API が呼ばれ全て PASS になる", async () => {
      const user = userEvent.setup();
      renderDebug();
      await waitFor(() => {
        expect(screen.getByText("全機能スモークテスト")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: "実行" }));
      await waitFor(
        () => {
          expect(screen.getAllByText("PASS").length).toBe(8);
        },
        { timeout: 3000 },
      );
      expect(api.deck.getCurrentDeck).toHaveBeenCalled();
      expect(api.deck.getAllDecks).toHaveBeenCalled();
      expect(api.telop.getState).toHaveBeenCalled();
    });

    it("ステップが失敗すると FAIL とエラーメッセージが表示される", async () => {
      const user = userEvent.setup();
      vi.mocked(api.deck.getAllDecks).mockRejectedValue(
        new Error("backend down"),
      );
      renderDebug();
      await waitFor(() => {
        expect(screen.getByText("全機能スモークテスト")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: "実行" }));
      await waitFor(
        () => {
          expect(screen.getByText("FAIL")).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
      expect(screen.getByText("backend down")).toBeInTheDocument();
    });
  });
});
