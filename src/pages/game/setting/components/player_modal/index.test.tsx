import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayerModal } from "./index";

vi.mock("../../../../../features/form/chip_form", () => ({
  ChipForm: ({
    value,
    onChange,
  }: {
    value: number;
    onChange: (v: number) => void;
  }) => (
    <input
      data-testid="chip-form"
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  ),
}));

describe("PlayerModal", () => {
  describe("add mode", () => {
    it("name と stack が onConfirm に渡る", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(
        <PlayerModal
          mode="add"
          seatIndex={0}
          defaultStack={10000}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );

      await user.type(screen.getByPlaceholderText("Player"), "Alice");
      await user.click(screen.getByText("追加"));

      expect(onConfirm).toHaveBeenCalledWith("Alice", 10000);
    });

    it("defaultStack が初期値として表示される", () => {
      render(
        <PlayerModal
          mode="add"
          seatIndex={0}
          defaultStack={5000}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByTestId("chip-form")).toHaveValue(5000);
    });

    it("stack <= 0 のとき confirm が disabled", async () => {
      const user = userEvent.setup();
      render(
        <PlayerModal
          mode="add"
          seatIndex={0}
          defaultStack={0}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      await user.type(screen.getByPlaceholderText("Player"), "Alice");
      const btn = screen.getByText("追加").closest("button");
      expect(btn).toBeDisabled();
    });
  });

  describe("edit mode", () => {
    it("currentStack が初期表示される", () => {
      render(
        <PlayerModal
          mode="edit"
          seatIndex={1}
          currentName="Bob"
          currentStack={8000}
          onConfirm={vi.fn()}
          onDelete={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByTestId("chip-form")).toHaveValue(8000);
    });

    it("name と stack が onConfirm に渡る", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(
        <PlayerModal
          mode="edit"
          seatIndex={1}
          currentName="Bob"
          currentStack={8000}
          onConfirm={onConfirm}
          onDelete={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      await user.click(screen.getByText("保存"));
      expect(onConfirm).toHaveBeenCalledWith("Bob", 8000);
    });
  });
});
