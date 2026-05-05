import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/client", () => ({
  api: {
    board: {
      updatePlayer: vi.fn(),
      removePlayer: vi.fn(),
    },
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import toast from "react-hot-toast";
import { api } from "../../../api/client";
import type { Player } from "../../../types";
import { PlayerEditModal } from "./index";

const mockPlayer: Player = {
  position: 0,
  name: "Alice",
  stack: 10000,
  hand: null,
  betInRound: 0,
  hasFolded: false,
  isAllIn: false,
  hasActed: false,
};

const defaultProps = {
  player: mockPlayer,
  isShowdown: false,
  canRemove: false,
  onClose: vi.fn(),
  onUpdated: vi.fn(),
};

function setup(props = defaultProps) {
  render(<PlayerEditModal {...props} />);
}

describe("PlayerEditModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.board.updatePlayer).mockResolvedValue({} as never);
  });

  it("スタックが 10,000,000 を超える場合は toast.error が呼ばれて保存されない", async () => {
    const user = userEvent.setup();
    setup();

    const inputs = screen.getAllByRole("textbox");
    const stackInput = inputs[1];
    await user.clear(stackInput);
    await user.type(stackInput, "10000001");

    await user.click(screen.getByText("保存"));

    expect(vi.mocked(toast).error).toHaveBeenCalledWith(
      expect.stringContaining("10,000,000"),
    );
    expect(api.board.updatePlayer).not.toHaveBeenCalled();
  });

  it("スタックが 10,000,000 以下の場合は保存処理が実行される", async () => {
    const user = userEvent.setup();
    setup();

    const inputs = screen.getAllByRole("textbox");
    const stackInput = inputs[1];
    await user.clear(stackInput);
    await user.type(stackInput, "10000000");

    await user.click(screen.getByText("保存"));

    expect(api.board.updatePlayer).toHaveBeenCalled();
  });
});
