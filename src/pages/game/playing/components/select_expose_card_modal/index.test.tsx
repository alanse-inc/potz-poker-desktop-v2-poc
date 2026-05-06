import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../../api/client";
import { SelectExposeCardModal } from "./index";

// api/client をモック
vi.mock("../../../../../api/client", () => ({
  api: {
    board: {
      getRemainingDeck: vi.fn(),
    },
    action: {
      expose: vi.fn(),
    },
    notifications: {
      onBoardUpdated: vi.fn(),
    },
  },
}));

// SVG インポートをスタブ
vi.mock("../../../../../features/card/face/svg/maps", () => ({
  suitSvgMap: {
    spade: "spade.svg",
    heart: "heart.svg",
    diamond: "diamond.svg",
    club: "club.svg",
  },
  valueSvgMap: {
    "2": "2.svg",
    "3": "3.svg",
    "4": "4.svg",
    "5": "5.svg",
    "6": "6.svg",
    "7": "7.svg",
    "8": "8.svg",
    "9": "9.svg",
    T: "T.svg",
    J: "J.svg",
    Q: "Q.svg",
    K: "K.svg",
    A: "A.svg",
  },
}));

describe("SelectExposeCardModal", () => {
  const onClose = vi.fn();
  const onConfirmed = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    onConfirmed.mockReset();
    // デフォルトは全52枚が残デッキ（使用済みカードなし）
    vi.mocked(api.board.getRemainingDeck).mockResolvedValue(
      (["spade", "heart", "diamond", "club"] as const).flatMap((suit) =>
        (
          [
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "T",
            "J",
            "Q",
            "K",
            "A",
          ] as const
        ).map((value) => ({ suit, value })),
      ),
    );
    vi.mocked(api.action.expose).mockResolvedValue({
      suit: "spade",
      value: "A",
    });
    vi.mocked(api.notifications.onBoardUpdated).mockResolvedValue(() => {});
  });

  it("モーダルが表示される", () => {
    render(
      <SelectExposeCardModal onClose={onClose} onConfirmed={onConfirmed} />,
    );
    expect(screen.getByText("Expose カードを選択")).toBeInTheDocument();
  });

  it("スーツラベルが表示される", () => {
    render(
      <SelectExposeCardModal onClose={onClose} onConfirmed={onConfirmed} />,
    );
    expect(screen.getByText("Spade")).toBeInTheDocument();
    expect(screen.getByText("Heart")).toBeInTheDocument();
    expect(screen.getByText("Diamond")).toBeInTheDocument();
    expect(screen.getByText("Club")).toBeInTheDocument();
  });

  it("初期状態では決定ボタンが disabled", () => {
    render(
      <SelectExposeCardModal onClose={onClose} onConfirmed={onConfirmed} />,
    );
    const confirmButton = screen.getByText("決定");
    expect(confirmButton).toBeDisabled();
  });

  it("キャンセルボタンをクリックすると onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    render(
      <SelectExposeCardModal onClose={onClose} onConfirmed={onConfirmed} />,
    );
    await user.click(screen.getByText("キャンセル"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("カードを選択すると決定ボタンが有効になる", async () => {
    const user = userEvent.setup();
    render(
      <SelectExposeCardModal onClose={onClose} onConfirmed={onConfirmed} />,
    );

    // Spade の A ボタン（Value A の alt テキストで探す）
    const cardButton = screen.getAllByRole("button", { name: /Value A/i })[0];
    await user.click(cardButton);

    const confirmButton = screen.getByText("決定");
    expect(confirmButton).not.toBeDisabled();
  });

  it("カードを選択して決定すると api.action.expose が呼ばれ onConfirmed が実行される", async () => {
    const user = userEvent.setup();
    render(
      <SelectExposeCardModal onClose={onClose} onConfirmed={onConfirmed} />,
    );

    // 最初の Value A カード（Spade の A）をクリック
    const cardButton = screen.getAllByRole("button", { name: /Value A/i })[0];
    await user.click(cardButton);

    await user.click(screen.getByText("決定"));

    await waitFor(() => {
      expect(api.action.expose).toHaveBeenCalledTimes(1);
      expect(onConfirmed).toHaveBeenCalledTimes(1);
    });
  });

  it("expose でエラーが発生しても onConfirmed は呼ばれない", async () => {
    vi.mocked(api.action.expose).mockReset();
    vi.mocked(api.action.expose).mockRejectedValue(new Error("expose error"));
    const user = userEvent.setup();
    render(
      <SelectExposeCardModal onClose={onClose} onConfirmed={onConfirmed} />,
    );

    const cardButton = screen.getAllByRole("button", { name: /Value A/i })[0];
    await user.click(cardButton);
    await user.click(screen.getByText("決定"));

    await waitFor(() => {
      expect(api.action.expose).toHaveBeenCalledTimes(1);
    });
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("getRemainingDeck が reject しても未処理 rejection にならない", async () => {
    vi.mocked(api.board.getRemainingDeck).mockReset();
    vi.mocked(api.board.getRemainingDeck).mockRejectedValue(
      new Error("deck error"),
    );
    expect(() =>
      render(
        <SelectExposeCardModal onClose={onClose} onConfirmed={onConfirmed} />,
      ),
    ).not.toThrow();
    // Promise の reject が伝播しないことを waitFor で確認
    await waitFor(() => {
      expect(api.board.getRemainingDeck).toHaveBeenCalledTimes(1);
    });
  });

  it("board_updated イベント発火後に getRemainingDeck が再度呼ばれる", async () => {
    let capturedCallback: ((board: unknown) => void) | undefined;
    vi.mocked(api.notifications.onBoardUpdated).mockImplementation((cb) => {
      capturedCallback = cb as (board: unknown) => void;
      return Promise.resolve(() => {});
    });

    render(
      <SelectExposeCardModal onClose={onClose} onConfirmed={onConfirmed} />,
    );

    // 初回フェッチを待つ
    await waitFor(() => {
      expect(api.board.getRemainingDeck).toHaveBeenCalledTimes(1);
    });

    // board_updated イベントをシミュレート
    capturedCallback?.(null);

    await waitFor(() => {
      expect(api.board.getRemainingDeck).toHaveBeenCalledTimes(2);
    });
  });
});
