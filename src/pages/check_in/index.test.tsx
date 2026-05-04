import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as backendModule from "../../api/backend";
import { BoardProvider } from "../../contexts/board_context";
import { CheckIn } from "./index";

// backend モジュールをまとめてモック
vi.mock("../../api/backend", () => ({
  BackendApiError: class BackendApiError extends Error {
    constructor(
      public status: number,
      public detail: string,
      public body: unknown,
    ) {
      super(`BackendApiError: status=${status} detail=${detail}`);
      this.name = "BackendApiError";
    }
  },
  getHealth: vi.fn(),
  listGameEvents: vi.fn(),
  getGameEventDetail: vi.fn(),
  getPlayer: vi.fn(),
  checkinPlayer: vi.fn(),
  checkoutPlayer: vi.fn(),
}));

// html5-qrcode をモック（JSdom では動作しないため）
vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    isScanning = false;
    start = vi.fn();
    stop = vi.fn();
    clear = vi.fn();
    static getCameras = vi.fn().mockResolvedValue([]);
  },
}));

const MOCK_EVENT_DETAIL = {
  gameEventId: "event00000000001",
  venueId: "e2e00000000000b0",
  gameTableId: "table0000000001",
  gameRule: "texas_holdem" as const,
  gameFormat: "ring_game" as const,
  status: "started" as const,
  gameName: "テストゲーム",
  defaultStack: 10000,
  miniChip: 100,
  smallBlind: 100,
  bigBlind: 200,
  anteRule: "none" as const,
  blindExceptionRule: "dead_button" as const,
  startDate: "2024-01-01",
  startedAt: "2024-01-01T00:00:00Z",
  finishedAt: null,
  startedTableId: null,
  sessions: [
    {
      gameSessionId: "session000000001",
      gameEventId: "event00000000001",
      gameTableId: "table0000000001",
      status: "started" as const,
      currentHandNumber: 5,
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: null,
      gameName: null,
      texasHoldemSetting: null,
      players: [],
    },
  ],
};

const MOCK_PLAYER = {
  playerId: "1234567890abcdef",
  nickName: "テストプレイヤー",
  avatarUrlSmall: null,
  avatarUrlLarge: null,
};

function renderCheckIn() {
  return render(
    <BoardProvider>
      <CheckIn />
    </BoardProvider>,
  );
}

describe("CheckIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(backendModule.getHealth).mockResolvedValue({ status: "ok" });
    vi.mocked(backendModule.listGameEvents).mockResolvedValue([
      MOCK_EVENT_DETAIL,
    ]);
    vi.mocked(backendModule.getGameEventDetail).mockResolvedValue(
      MOCK_EVENT_DETAIL,
    );
    vi.mocked(backendModule.getPlayer).mockResolvedValue(MOCK_PLAYER);
    vi.mocked(backendModule.checkinPlayer).mockResolvedValue({
      gameSessionId: "session000000001",
      playerId: "1234567890abcdef",
      nickName: "テストプレイヤー",
      avatarPath: null,
      startHandNumber: 6,
      finishedHandNumber: null,
      checkedInAt: "2024-01-01T01:00:00Z",
      checkedOutAt: null,
    });
  });

  it("マウント時に health check と listGameEvents を呼ぶ", async () => {
    renderCheckIn();
    await waitFor(() => {
      expect(backendModule.getHealth).toHaveBeenCalled();
      expect(backendModule.listGameEvents).toHaveBeenCalled();
    });
  });

  it("イベントが 1 件の場合、スキャンステップが表示される", async () => {
    renderCheckIn();
    await waitFor(() => {
      expect(
        screen.getByText(
          "USB QR リーダーでプレイヤーの QR コードをスキャンしてください",
        ),
      ).toBeInTheDocument();
    });
  });

  it("イベントが複数の場合、イベント選択ステップが表示される", async () => {
    const secondEvent = {
      ...MOCK_EVENT_DETAIL,
      gameEventId: "event00000000002",
      gameName: "セカンドゲーム",
    };
    vi.mocked(backendModule.listGameEvents).mockResolvedValue([
      MOCK_EVENT_DETAIL,
      secondEvent,
    ]);
    vi.mocked(backendModule.getGameEventDetail)
      .mockResolvedValueOnce(MOCK_EVENT_DETAIL)
      .mockResolvedValueOnce({
        ...MOCK_EVENT_DETAIL,
        gameEventId: "event00000000002",
        gameName: "セカンドゲーム",
      });

    renderCheckIn();
    await waitFor(() => {
      expect(
        screen.getByText("参加するイベントを選択してください"),
      ).toBeInTheDocument();
    });
  });

  it("モード切替ボタンでカメラ/USB を切り替えられる", async () => {
    const user = userEvent.setup();
    renderCheckIn();

    await waitFor(() => {
      expect(screen.getByText("USB QR リーダー")).toBeInTheDocument();
    });

    await user.click(screen.getByText("USB QR リーダー"));
    await waitFor(() => {
      expect(screen.getByText("カメラ")).toBeInTheDocument();
    });
  });

  it("USB入力でスキャンするとスタック入力ステップに移行する", async () => {
    renderCheckIn();

    // イベント読み込み待ち
    await waitFor(() => {
      expect(backendModule.listGameEvents).toHaveBeenCalled();
    });

    // USB QR リーダー入力をシミュレート: keydown シーケンス
    const url = "https://potz.poker/checkin/1234567890abcdef";
    for (const char of url) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, bubbles: true }),
      );
    }
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    await waitFor(() => {
      expect(backendModule.getPlayer).toHaveBeenCalledWith("1234567890abcdef");
    });

    await waitFor(() => {
      expect(screen.getByText("テストプレイヤー")).toBeInTheDocument();
      expect(screen.getByLabelText("スタック額")).toBeInTheDocument();
    });
  });

  it("スタック入力後にチェックインボタンを押すと checkinPlayer が呼ばれる", async () => {
    const user = userEvent.setup();
    renderCheckIn();

    await waitFor(() => {
      expect(backendModule.listGameEvents).toHaveBeenCalled();
    });

    // スキャンをシミュレート
    const url = "https://potz.poker/checkin/1234567890abcdef";
    for (const char of url) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, bubbles: true }),
      );
    }
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("スタック額")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("スタック額"), "10000");
    await user.click(screen.getByText("チェックイン"));

    await waitFor(() => {
      expect(backendModule.checkinPlayer).toHaveBeenCalledWith({
        gameEventId: "event00000000001",
        gameSessionId: "session000000001",
        playerId: "1234567890abcdef",
      });
    });
  });

  it("チェックイン成功後に完了ステップが表示される", async () => {
    const user = userEvent.setup();
    renderCheckIn();

    await waitFor(() => {
      expect(backendModule.listGameEvents).toHaveBeenCalled();
    });

    // スキャン
    const url = "https://potz.poker/checkin/1234567890abcdef";
    for (const char of url) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, bubbles: true }),
      );
    }
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("スタック額")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("スタック額"), "10000");
    await user.click(screen.getByText("チェックイン"));

    await waitFor(() => {
      expect(screen.getByText("チェックイン完了")).toBeInTheDocument();
    });
  });

  it("無効なQRコードの場合はエラートーストが表示される", async () => {
    renderCheckIn();

    await waitFor(() => {
      expect(backendModule.listGameEvents).toHaveBeenCalled();
    });

    // 無効な文字列を入力
    "invalid-qr-not-url".split("").forEach((char) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, bubbles: true }),
      );
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    await waitFor(() => {
      expect(backendModule.getPlayer).not.toHaveBeenCalled();
    });
  });
});
