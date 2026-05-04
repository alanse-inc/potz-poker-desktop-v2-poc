import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameSetting } from "./index";

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockLoadSettings = vi.fn();
const mockSaveSettings = vi.fn();
vi.mock("../../../api/client", () => ({
  api: {
    gameSettings: {
      load: (...args: unknown[]) => mockLoadSettings(...args),
      save: (...args: unknown[]) => mockSaveSettings(...args),
    },
  },
}));

vi.mock("../../../hooks/useAutoScale", () => ({
  useAutoScale: () => ({
    containerRef: { current: null },
    contentRef: { current: null },
  }),
}));

const defaultSettings = {
  smallBlind: 100,
  bigBlind: 200,
  minChip: 100,
  bbAnte: false,
};

const setup = () => {
  mockLoadSettings.mockResolvedValue(defaultSettings);
  render(
    <MemoryRouter>
      <GameSetting />
    </MemoryRouter>,
  );
};

describe("GameSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockResolvedValue(defaultSettings);
    mockSaveSettings.mockResolvedValue(undefined);
  });

  describe("永続化", () => {
    it("マウント時に api.gameSettings.load() が呼ばれる", async () => {
      setup();
      await waitFor(() => {
        expect(mockLoadSettings).toHaveBeenCalledTimes(1);
      });
    });

    it("SB ボタンをクリックしてチップ額を確定すると save が呼ばれる", async () => {
      const user = userEvent.setup();
      setup();

      await waitFor(() => expect(mockLoadSettings).toHaveBeenCalled());

      const sbButton = await screen.findByText("SB");
      await user.click(sbButton);

      const input = await screen.findByRole("spinbutton");
      await user.clear(input);
      await user.type(input, "50");

      const confirmButton = screen.getByText("決定");
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockSaveSettings).toHaveBeenCalledWith(
          expect.objectContaining({ smallBlind: 50 }),
        );
      });
    });
  });

  describe("GAME START ボタンの enable/disable", () => {
    it("初期状態（プレイヤー0人）では GAME START が disabled", async () => {
      setup();
      await waitFor(() => expect(mockLoadSettings).toHaveBeenCalled());
      const btn = screen.getByText("GAME START");
      expect(btn).toBeDisabled();
    });

    it("2人以上着席すると GAME START が enabled になる", async () => {
      const user = userEvent.setup();
      setup();
      await waitFor(() => expect(mockLoadSettings).toHaveBeenCalled());

      // Seat1 に追加
      const plusButtons = await screen.findAllByText("+");
      await user.click(plusButtons[0]);
      const nameInput = screen.getByPlaceholderText("Player");
      await user.type(nameInput, "Alice");
      await user.click(screen.getByText("追加"));

      // Seat2 に追加
      const plusButtons2 = screen.getAllByText("+");
      await user.click(plusButtons2[1]);
      const nameInput2 = screen.getByPlaceholderText("Player");
      await user.type(nameInput2, "Bob");
      await user.click(screen.getByText("追加"));

      await waitFor(() => {
        expect(screen.getByText("GAME START")).not.toBeDisabled();
      });
    });
  });

  describe("GAME START で navigate が正しく呼ばれる", () => {
    it("2人以上で GAME START を押すと select-btn に navigate される", async () => {
      const user = userEvent.setup();
      setup();
      await waitFor(() => expect(mockLoadSettings).toHaveBeenCalled());

      // 2人追加
      const plusButtons = await screen.findAllByText("+");
      await user.click(plusButtons[0]);
      await user.type(screen.getByPlaceholderText("Player"), "Alice");
      await user.click(screen.getByText("追加"));

      const plusButtons2 = screen.getAllByText("+");
      await user.click(plusButtons2[1]);
      await user.type(screen.getByPlaceholderText("Player"), "Bob");
      await user.click(screen.getByText("追加"));

      const startBtn = screen.getByText("GAME START");
      await user.click(startBtn);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/game/select-btn", {
          state: expect.objectContaining({
            smallBlind: 100,
            bigBlind: 200,
            minChip: 100,
            bbAnte: false,
            playerNames: expect.arrayContaining(["Alice", "Bob"]),
          }),
        });
      });
    });
  });

  describe("BACK ボタン", () => {
    it("BACK ボタンを押すと navigate('/') が呼ばれる", async () => {
      const user = userEvent.setup();
      setup();
      await waitFor(() => expect(mockLoadSettings).toHaveBeenCalled());

      await user.click(screen.getByText("BACK"));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });
});
