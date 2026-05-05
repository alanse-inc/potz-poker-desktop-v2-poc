import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BetAmountModal } from "./index";

describe("BetAmountModal", () => {
  it("2BB ボタンクリックで input の値が 2 * bigBlind に更新される", async () => {
    const user = userEvent.setup();
    render(
      <BetAmountModal
        type="BET"
        minAmount={1}
        maxAmount={10000}
        bigBlind={200}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    const input = screen.getByRole("spinbutton");
    await user.click(screen.getByRole("button", { name: /^2BB/ }));
    expect((input as HTMLInputElement).value).toBe("400");
  });

  it("3BB ボタンクリックで input の値が 3 * bigBlind に更新される", async () => {
    const user = userEvent.setup();
    render(
      <BetAmountModal
        type="BET"
        minAmount={1}
        maxAmount={10000}
        bigBlind={200}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    const input = screen.getByRole("spinbutton");
    await user.click(screen.getByRole("button", { name: /^3BB/ }));
    expect((input as HTMLInputElement).value).toBe("600");
  });

  it("MIN と 2BB が同じ値の場合、片方は重複表示されない", () => {
    render(
      <BetAmountModal
        type="RAISE"
        minAmount={400}
        maxAmount={10000}
        bigBlind={200}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: /^MIN/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^2BB/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^3BB/ })).toBeInTheDocument();
  });

  it("potAmount が minAmount 未満のとき POT ボタンが表示されない", () => {
    render(
      <BetAmountModal
        type="BET"
        minAmount={100}
        maxAmount={1000}
        bigBlind={50}
        potAmount={50}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /^POT/ }),
    ).not.toBeInTheDocument();
  });

  it("potAmount が minAmount 以上 maxAmount 以下のとき POT ボタンが表示され値が正しい", () => {
    render(
      <BetAmountModal
        type="BET"
        minAmount={100}
        maxAmount={1000}
        bigBlind={50}
        potAmount={200}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    const potButton = screen.getByRole("button", { name: /^POT/ });
    expect(potButton).toBeInTheDocument();
    expect(potButton).toHaveTextContent("200");
  });

  it("小数値を手入力すると実行ボタンが disabled になる", async () => {
    const user = userEvent.setup();
    render(
      <BetAmountModal
        type="BET"
        minAmount={1}
        maxAmount={10000}
        bigBlind={200}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "300.5");

    const confirmButton = screen.getByRole("button", { name: /BET を実行/ });
    expect(confirmButton).toBeDisabled();
  });
});
