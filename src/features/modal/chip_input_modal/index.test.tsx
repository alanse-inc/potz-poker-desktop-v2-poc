import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChipInputModal } from "./index";

const setup = (props?: Partial<Parameters<typeof ChipInputModal>[0]>) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ChipInputModal
      title="SB を入力"
      initialValue={100}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
};

describe("ChipInputModal", () => {
  it("タイトルが表示される", () => {
    setup();
    expect(screen.getByText("SB を入力")).toBeInTheDocument();
  });

  it("initialValue が input に表示される", () => {
    setup({ initialValue: 200 });
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("200");
  });

  it("値を変更して決定をクリックすると onConfirm が正しい値で呼ばれる", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "50");

    await user.click(screen.getByText("決定"));
    expect(onConfirm).toHaveBeenCalledWith(50);
  });

  it("0 以下の値では決定ボタンが disabled になる", async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "0");

    expect(screen.getByText("決定")).toBeDisabled();
  });

  it("バリデーションエラーがあると決定ボタンが disabled になりエラーが表示される", async () => {
    const user = userEvent.setup();
    const validate = (v: number) =>
      v % 2 !== 0 ? "偶数を入力してください" : null;
    setup({ validate });

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "3");

    expect(screen.getByText("偶数を入力してください")).toBeInTheDocument();
    expect(screen.getByText("決定")).toBeDisabled();
  });

  it("バリデーションが通ると決定ボタンが enabled になる", async () => {
    const user = userEvent.setup();
    const validate = (v: number) =>
      v % 2 !== 0 ? "偶数を入力してください" : null;
    setup({ validate, initialValue: 100 });

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "4");

    expect(screen.getByText("決定")).not.toBeDisabled();
  });

  it("キャンセルをクリックすると onCancel が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();

    await user.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("小数値を入力すると決定ボタンが disabled になる", async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "1.5");

    expect(screen.getByText("決定")).toBeDisabled();
  });

  it("全角数字を入力すると決定ボタンが disabled になる", async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "１００");

    expect(screen.getByText("決定")).toBeDisabled();
  });
});
