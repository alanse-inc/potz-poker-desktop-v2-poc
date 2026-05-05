import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../hooks/useAutoScale", () => ({
  useAutoScale: () => ({
    containerRef: { current: null },
    contentRef: { current: null },
  }),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../../../../api/client", () => ({
  api: {
    gameSettings: {
      load: vi.fn().mockResolvedValue({
        smallBlind: 100,
        bigBlind: 200,
        minChip: 100,
        bbAnte: false,
      }),
      save: vi.fn(),
    },
    board: {
      startGame: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("../../../../features/modal/chip_input_modal", () => ({
  ChipInputModal: ({
    onConfirm,
    onCancel,
  }: {
    title: string;
    onConfirm: (v: number) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="chip-input-modal">
      <button
        type="button"
        data-testid="chip-confirm"
        onClick={() => onConfirm(100)}
      >
        confirm
      </button>
      <button type="button" data-testid="chip-cancel" onClick={onCancel}>
        cancel
      </button>
    </div>
  ),
}));

import toast from "react-hot-toast";
import { api } from "../../../../api/client";
import { FirstGameSetting } from "./index";

function renderSetting() {
  return render(
    <MemoryRouter>
      <FirstGameSetting />
    </MemoryRouter>,
  );
}

describe("FirstGameSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.gameSettings.load).mockResolvedValue({
      smallBlind: 100,
      bigBlind: 200,
      minChip: 100,
      bbAnte: false,
    });
  });

  it("GAME START ボタンが初期状態で disabled になっている", async () => {
    renderSetting();
    const btn = screen.getByText("GAME START").closest("button");
    expect(btn).toBeDisabled();
  });

  it("SB >= BB の場合、GAME START 時に toast.error が呼ばれて startGame は実行されない", async () => {
    const user = userEvent.setup();

    vi.mocked(api.gameSettings.load).mockResolvedValue({
      smallBlind: 200,
      bigBlind: 200,
      minChip: 100,
      bbAnte: false,
    });

    renderSetting();

    await vi.waitFor(() => expect(api.gameSettings.load).toHaveBeenCalled());

    const btn = screen.getByText("GAME START").closest("button");
    if (btn && !btn.hasAttribute("disabled")) {
      await user.click(btn);
      expect(vi.mocked(toast).error).toHaveBeenCalledWith(
        expect.stringContaining("SB"),
      );
      expect(api.board.startGame).not.toHaveBeenCalled();
    }
  });
});
