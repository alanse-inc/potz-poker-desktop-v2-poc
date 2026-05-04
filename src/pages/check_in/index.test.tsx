import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as backendModule from "../../api/backend";
import { InitializeBoardCommandContext } from "../../contexts/initialize_board_command_context";
import { SessionContext } from "../../contexts/session_context";
import { CheckIn } from "./index";

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
  getPlayer: vi.fn(),
  checkinPlayer: vi.fn(),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    isScanning = false;
    start = vi.fn();
    stop = vi.fn();
    clear = vi.fn();
    static getCameras = vi.fn().mockResolvedValue([]);
  },
}));

const MOCK_SESSION = {
  gameSessionId: "session000000001",
  gameEventId: "event00000000001",
  gameTableId: "table0000000001",
  status: "started" as const,
  currentHandNumber: 5,
  startedAt: "2024-01-01T00:00:00Z",
  finishedAt: null,
  gameName: null,
  texasHoldemSetting: null,
};

const MOCK_PLAYER_RESPONSE = {
  playerId: "1234567890abcdef",
  nickName: "テストプレイヤー",
  avatarUrlSmall: null,
  avatarUrlLarge: null,
};

const MOCK_CHECKIN_RESPONSE = {
  gameSessionId: "session000000001",
  playerId: "1234567890abcdef",
  nickName: "テストプレイヤー",
  avatarPath: null,
  startHandNumber: 6,
  finishedHandNumber: null,
  checkedInAt: "2024-01-01T01:00:00Z",
  checkedOutAt: null,
};

const mockUpdatePlayer = vi.fn();
const mockInitializeBoardCommand = {
  kind: "initializeBoard" as const,
  input: {
    players: [] as {
      id: string;
      name: string;
      icon?: string;
      status: "active" | "leaved" | "bust";
      stack: number;
      position: null;
      seat: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    }[],
    setting: {
      mode: "manual" as const,
      name: "",
      miniChip: 0,
      smallBlind: 0,
      bigBlind: 0,
      anteRule: "none" as const,
      blindExceptionRule: "dead_button" as const,
    },
  },
};

function renderCheckIn(initialState?: { source?: string }) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: "/check-in", state: initialState }]}
    >
      <InitializeBoardCommandContext.Provider
        value={{
          initializeBoardCommand: mockInitializeBoardCommand,
          isStartable: false,
          updateInitializeBoardSetting: vi.fn(),
          updatePlayer: mockUpdatePlayer,
          deletePlayer: vi.fn(),
          updateInitializeBoardSettingForDevelopment: vi.fn(),
        }}
      >
        <SessionContext.Provider
          value={{
            currentSession: MOCK_SESSION,
            setCurrentSession: vi.fn(),
            currentGameSessionId: MOCK_SESSION.gameSessionId,
            setCurrentGameSessionId: vi.fn(),
            lastHandNumber: 0,
            setLastHandNumber: vi.fn(),
          }}
        >
          <CheckIn />
        </SessionContext.Provider>
      </InitializeBoardCommandContext.Provider>
    </MemoryRouter>,
  );
}

function simulateUsbScan(url: string) {
  for (const char of url) {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: char, bubbles: true }),
    );
  }
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
}

describe("CheckIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(backendModule.getPlayer).mockResolvedValue(MOCK_PLAYER_RESPONSE);
    vi.mocked(backendModule.checkinPlayer).mockResolvedValue(
      MOCK_CHECKIN_RESPONSE,
    );
  });

  describe("スキャニングステップ", () => {
    it("初期表示でスキャニング UI が表示される", () => {
      renderCheckIn();
      expect(
        screen.getByText(
          "USB QRリーダーでプレイヤーのQRコードをスキャンしてください",
        ),
      ).toBeInTheDocument();
    });

    it("カメラモード切り替えスイッチが表示される", () => {
      renderCheckIn();
      expect(screen.getByText("カメラモード")).toBeInTheDocument();
    });

    it("BACK ボタンが表示される", () => {
      renderCheckIn();
      expect(screen.getByText("BACK")).toBeInTheDocument();
    });

    it("USB 入力でスキャンするとスタック入力ステップに移行する", async () => {
      renderCheckIn();

      simulateUsbScan("https://potz.poker/checkin/1234567890abcdef");

      await waitFor(() => {
        expect(backendModule.getPlayer).toHaveBeenCalledWith(
          "1234567890abcdef",
        );
      });

      await waitFor(() => {
        expect(screen.getByText("テストプレイヤー")).toBeInTheDocument();
        expect(
          screen.getByText("スタックを入力してください"),
        ).toBeInTheDocument();
      });
    });

    it("無効な QR コードの場合は getPlayer が呼ばれない", async () => {
      renderCheckIn();

      simulateUsbScan("invalid-not-a-valid-url");

      await waitFor(() => {
        expect(backendModule.getPlayer).not.toHaveBeenCalled();
      });
    });

    it("getPlayer が 404 を返した場合はスキャニングステップのまま", async () => {
      const { BackendApiError } = await import("../../api/backend");
      vi.mocked(backendModule.getPlayer).mockRejectedValue(
        new BackendApiError(404, "Not Found", null),
      );

      renderCheckIn();
      simulateUsbScan("https://potz.poker/checkin/1234567890abcdef");

      await waitFor(() => {
        expect(backendModule.getPlayer).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            "USB QRリーダーでプレイヤーのQRコードをスキャンしてください",
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe("スタック入力ステップ", () => {
    async function advanceToStackInput() {
      renderCheckIn();
      simulateUsbScan("https://potz.poker/checkin/1234567890abcdef");
      await waitFor(() => {
        expect(
          screen.getByText("スタックを入力してください"),
        ).toBeInTheDocument();
      });
    }

    it("CANCEL を押すとスキャニングステップに戻る", async () => {
      const user = userEvent.setup();
      await advanceToStackInput();

      await user.click(screen.getByText("CANCEL"));

      expect(
        screen.getByText(
          "USB QRリーダーでプレイヤーのQRコードをスキャンしてください",
        ),
      ).toBeInTheDocument();
    });

    it("スタックが 0 のとき OK ボタンが disabled になる", async () => {
      await advanceToStackInput();

      const okButton = screen.getByRole("button", { name: "OK" });
      expect(okButton).toBeDisabled();
    });

    it("数字ボタンを押すと OK ボタンが有効になる", async () => {
      const user = userEvent.setup();
      await advanceToStackInput();

      const btn1 = screen.getAllByRole("button", { name: "1" })[0];
      await user.click(btn1);

      const okButton = screen.getByRole("button", { name: "OK" });
      expect(okButton).not.toBeDisabled();
    });
  });

  describe("座席選択ステップ", () => {
    async function advanceToSeatSelection() {
      const user = userEvent.setup();
      renderCheckIn();

      simulateUsbScan("https://potz.poker/checkin/1234567890abcdef");

      await waitFor(() => {
        expect(
          screen.getByText("スタックを入力してください"),
        ).toBeInTheDocument();
      });

      const btn1 = screen.getAllByRole("button", { name: "1" })[0];
      await user.click(btn1);

      await user.click(screen.getByRole("button", { name: "OK" }));

      await waitFor(() => {
        expect(screen.getByText("座席を選択してください")).toBeInTheDocument();
      });
    }

    it("座席選択ステップでボードが表示される", async () => {
      await advanceToSeatSelection();
      expect(screen.getByText("座席を選択してください")).toBeInTheDocument();
    });

    it("空席（+ボタン）をクリックすると checkinPlayer が呼ばれる", async () => {
      const user = userEvent.setup();
      await advanceToSeatSelection();

      const plusButtons = screen.getAllByRole("button", { name: "+" });
      await user.click(plusButtons[0]);

      await waitFor(() => {
        expect(backendModule.checkinPlayer).toHaveBeenCalledWith({
          gameEventId: "event00000000001",
          gameSessionId: "session000000001",
          playerId: "1234567890abcdef",
        });
      });
    });

    it("チェックイン成功後に updatePlayer が呼ばれる", async () => {
      const user = userEvent.setup();
      await advanceToSeatSelection();

      const plusButtons = screen.getAllByRole("button", { name: "+" });
      await user.click(plusButtons[0]);

      await waitFor(() => {
        expect(mockUpdatePlayer).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "1234567890abcdef",
            name: "テストプレイヤー",
            status: "active",
          }),
        );
      });
    });

    it("422 エラーの場合はスキャニングステップに戻る", async () => {
      const user = userEvent.setup();
      const { BackendApiError } = await import("../../api/backend");
      vi.mocked(backendModule.checkinPlayer).mockRejectedValue(
        new BackendApiError(422, "Already checked in", null),
      );

      await advanceToSeatSelection();

      const plusButtons = screen.getAllByRole("button", { name: "+" });
      await user.click(plusButtons[0]);

      await waitFor(() => {
        expect(
          screen.getByText(
            "USB QRリーダーでプレイヤーのQRコードをスキャンしてください",
          ),
        ).toBeInTheDocument();
      });
    });
  });
});
