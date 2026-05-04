import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CheckInPlayer } from "./check_in_player_card";
import { CheckInPlayerCard } from "./check_in_player_card";

const makePlayer = (override: Partial<CheckInPlayer> = {}): CheckInPlayer => ({
  id: "player-1",
  name: "テストプレイヤー",
  icon: undefined,
  status: "active",
  stack: 10000,
  position: null,
  seat: 1,
  ...override,
});

describe("CheckInPlayerCard", () => {
  it("プレイヤー名を表示する", () => {
    render(<CheckInPlayerCard player={makePlayer({ name: "Taro" })} />);
    expect(screen.getByText("Taro")).toBeInTheDocument();
  });

  it("名前なしの場合は NO NAME を表示する", () => {
    render(<CheckInPlayerCard player={makePlayer({ name: "" })} />);
    expect(screen.getByText("NO NAME")).toBeInTheDocument();
  });

  it("スタック額をフォーマットして表示する", () => {
    render(<CheckInPlayerCard player={makePlayer({ stack: 10000 })} />);
    expect(screen.getByText("10K")).toBeInTheDocument();
  });

  it("leaved ステータスのプレイヤーは離席中を表示し、opacity-50 クラスが付く", () => {
    const { container } = render(
      <CheckInPlayerCard player={makePlayer({ status: "leaved" })} />,
    );
    expect(screen.getByText("離席中")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("opacity-50");
  });

  it("bust ステータスのプレイヤーは BUST を表示し、opacity-50 クラスが付く", () => {
    const { container } = render(
      <CheckInPlayerCard player={makePlayer({ status: "bust" })} />,
    );
    expect(screen.getByText("BUST")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("opacity-50");
  });

  it("active ステータスのプレイヤーはステータステキストを表示せず opacity-50 が付かない", () => {
    const { container } = render(
      <CheckInPlayerCard player={makePlayer({ status: "active" })} />,
    );
    expect(screen.queryByText("離席中")).not.toBeInTheDocument();
    expect(screen.queryByText("BUST")).not.toBeInTheDocument();
    expect(container.firstChild).not.toHaveClass("opacity-50");
  });

  it("ポジション btn を BTN と表示する", () => {
    render(<CheckInPlayerCard player={makePlayer({ position: "btn" })} />);
    expect(screen.getByText("BTN")).toBeInTheDocument();
  });

  it("ポジション bb を BB と表示する", () => {
    render(<CheckInPlayerCard player={makePlayer({ position: "bb" })} />);
    expect(screen.getByText("BB")).toBeInTheDocument();
  });

  it("position が null のときはポジションテキストを表示しない", () => {
    render(<CheckInPlayerCard player={makePlayer({ position: null })} />);
    expect(screen.queryByText("BTN")).not.toBeInTheDocument();
    expect(screen.queryByText("BB")).not.toBeInTheDocument();
  });
});
