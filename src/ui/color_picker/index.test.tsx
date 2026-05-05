import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./index";

describe("ColorPicker", () => {
  it("初期値が表示される", () => {
    render(<ColorPicker value="#ff0000" onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("#000000") as HTMLInputElement;
    expect(input.value).toBe("#ff0000");
  });

  it("有効な value prop 変更時に isValidColor が true になる", () => {
    const { rerender } = render(
      <ColorPicker value="#ff0000" onChange={vi.fn()} />,
    );
    rerender(<ColorPicker value="#00ff00" onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("#000000") as HTMLInputElement;
    expect(input.value).toBe("#00ff00");
    // エラーメッセージが表示されないことを確認
    expect(
      screen.queryByText("無効なカラーコードです（例: #FF0000）"),
    ).toBeNull();
  });

  it("無効な value prop 変更時にエラーメッセージが表示される", () => {
    const { rerender } = render(
      <ColorPicker value="#ff0000" onChange={vi.fn()} />,
    );
    rerender(<ColorPicker value="invalid" onChange={vi.fn()} />);
    expect(
      screen.getByText("無効なカラーコードです（例: #FF0000）"),
    ).toBeInTheDocument();
  });

  it("無効な value prop 変更時に currentValidColor は直前の有効値を維持する", () => {
    const { rerender } = render(
      <ColorPicker value="#ff0000" onChange={vi.fn()} />,
    );
    rerender(<ColorPicker value="invalid" onChange={vi.fn()} />);
    // ネイティブカラーピッカーは currentValidColor を使用するため #ff0000 を維持
    const colorInput = document.querySelector(
      "input[type='color']",
    ) as HTMLInputElement;
    expect(colorInput.value).toBe("#ff0000");
  });

  it("テキスト入力で有効なカラーコードを入力すると onChange が呼ばれる", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#ff0000" onChange={onChange} />);
    const input = screen.getByPlaceholderText("#000000");
    fireEvent.change(input, { target: { value: "#0000ff" } });
    expect(onChange).toHaveBeenCalledWith("#0000ff");
  });

  it("テキスト入力で無効なカラーコードを入力すると onChange が呼ばれない", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#ff0000" onChange={onChange} />);
    const input = screen.getByPlaceholderText("#000000");
    fireEvent.change(input, { target: { value: "notacolor" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("label が指定されると表示される", () => {
    render(
      <ColorPicker value="#ff0000" onChange={vi.fn()} label="背景色" />,
    );
    expect(screen.getByText("背景色")).toBeInTheDocument();
  });
});
