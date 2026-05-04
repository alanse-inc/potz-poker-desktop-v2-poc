import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManualModeInitializeBoardCommand } from "../../../../contexts/initialize_board_command_context";
import { NextGameSetting } from "./index";

vi.mock("../../../../api/fetch", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../../../hooks/useAutoScale", () => ({
  useAutoScale: () => ({
    containerRef: { current: null },
    contentRef: { current: null },
  }),
}));

vi.mock("../../../../hooks/useReconcileCheckedOutPlayers", () => ({
  useReconcileCheckedOutPlayers: vi.fn(),
}));

vi.mock("../../../../hooks/useRestoreSessionFromPreferences", () => ({
  useRestoreSessionFromPreferences: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let mockCommand: ManualModeInitializeBoardCommand;
const mockUpdateInitializeBoardSetting = vi.fn();
const mockUpdatePlayer = vi.fn();
const mockDeletePlayer = vi.fn();
let mockIsStartable = false;

vi.mock("../../../../contexts/initialize_board_command_context", () => ({
  useInitializeBoardCommand: () => ({
    initializeBoardCommand: mockCommand,
    isStartable: mockIsStartable,
    updateInitializeBoardSetting: mockUpdateInitializeBoardSetting,
    updatePlayer: mockUpdatePlayer,
    deletePlayer: mockDeletePlayer,
    updateInitializeBoardSettingForDevelopment: vi.fn(),
  }),
}));

vi.mock("../../../../features/modal/auto_mode_player_edit_modal", () => ({
  AutoModePlayerEditModal: ({
    onCancel,
    onDelete,
  }: {
    onCancel: () => void;
    onDelete: () => void;
  }) => (
    <div data-testid="player-edit-modal">
      <button type="button" data-testid="modal-cancel" onClick={onCancel}>
        cancel
      </button>
      <button type="button" data-testid="modal-delete" onClick={onDelete}>
        delete
      </button>
    </div>
  ),
}));

vi.mock("../../../../features/modal/chip_input_modal", () => ({
  ChipInputModal: ({
    title,
    onConfirm,
    onCancel,
  }: {
    title: string;
    onConfirm: (v: number) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="chip-input-modal">
      <span>{title}</span>
      <button
        type="button"
        data-testid="chip-confirm"
        onClick={() => onConfirm(500)}
      >
        confirm
      </button>
      <button type="button" data-testid="chip-cancel" onClick={onCancel}>
        cancel
      </button>
    </div>
  ),
}));

const makeCommand = (
  override: Partial<ManualModeInitializeBoardCommand["input"]> = {},
): ManualModeInitializeBoardCommand => ({
  kind: "initializeBoard",
  input: {
    players: [
      {
        id: "p1",
        name: "Alice",
        status: "active",
        stack: 10000,
        position: "btn",
        seat: 1,
      },
      {
        id: "p2",
        name: "Bob",
        status: "active",
        stack: 9000,
        position: "bb",
        seat: 2,
      },
    ],
    setting: {
      mode: "manual",
      name: "TEST GAME",
      miniChip: 100,
      smallBlind: 500,
      bigBlind: 1000,
      anteRule: "none",
      blindExceptionRule: "dead_button",
    },
    ...override,
  },
});

const renderSetting = () =>
  render(
    <MemoryRouter>
      <NextGameSetting />
    </MemoryRouter>,
  );

describe("NextGameSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommand = makeCommand();
    mockIsStartable = true;
  });

  it("プレイヤー名が表示される", () => {
    renderSetting();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("ゲーム名が表示される", () => {
    renderSetting();
    expect(screen.getByText("TEST GAME")).toBeInTheDocument();
  });

  it("HOME ボタンをクリックすると first-game/setting に navigate する", async () => {
    const user = userEvent.setup();
    renderSetting();

    const homeButton = screen.getByText("HOME");
    await user.click(homeButton);

    expect(mockNavigate).toHaveBeenCalledWith("/game/first-game/setting");
  });

  it("isStartable=false のとき NEXT GAME ボタンが disabled になる", () => {
    mockIsStartable = false;
    renderSetting();

    const btn = screen.getByText("NEXT GAME").closest("button");
    expect(btn).toBeDisabled();
  });

  it("isStartable=true のとき NEXT GAME ボタンが有効になる", () => {
    mockIsStartable = true;
    renderSetting();

    const btn = screen.getByText("NEXT GAME").closest("button");
    expect(btn).not.toBeDisabled();
  });

  it("SB SquareButton をクリックするとチップ入力モーダルが開く", async () => {
    const user = userEvent.setup();
    renderSetting();

    const sbButton = screen.getByRole("button", { name: "SB 500" });
    await user.click(sbButton);

    await waitFor(() => {
      expect(screen.getByTestId("chip-input-modal")).toBeInTheDocument();
    });
    expect(screen.getByText("SBはいくらですか？")).toBeInTheDocument();
  });

  it("BB SquareButton をクリックするとチップ入力モーダルが開く", async () => {
    const user = userEvent.setup();
    renderSetting();

    const bbButton = screen.getByRole("button", { name: "BB 1000" });
    await user.click(bbButton);

    await waitFor(() => {
      expect(screen.getByTestId("chip-input-modal")).toBeInTheDocument();
    });
    expect(screen.getByText("BBはいくらですか？")).toBeInTheDocument();
  });

  it("チップ入力を確定すると updateInitializeBoardSetting が呼ばれる", async () => {
    const user = userEvent.setup();
    renderSetting();

    await user.click(screen.getByRole("button", { name: "SB 500" }));
    await waitFor(() =>
      expect(screen.getByTestId("chip-input-modal")).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("chip-confirm"));

    await waitFor(() => {
      expect(mockUpdateInitializeBoardSetting).toHaveBeenCalledWith(
        "smallBlind",
        500,
      );
    });
    expect(screen.queryByTestId("chip-input-modal")).not.toBeInTheDocument();
  });

  it("BTN SquareButton をクリックすると select-btn に navigate する", async () => {
    const user = userEvent.setup();
    renderSetting();

    const btnButton = screen.getByRole("button", { name: "BTN" });
    await user.click(btnButton);

    expect(mockNavigate).toHaveBeenCalledWith("/game/next-game/select-btn");
  });

  it("全プレイヤーが leaved のとき BTN SquareButton をクリックしても navigate しない", async () => {
    const user = userEvent.setup();
    mockCommand = makeCommand({
      players: [
        {
          id: "p1",
          name: "Alice",
          status: "leaved",
          stack: 10000,
          position: null,
          seat: 1,
        },
      ],
    });
    renderSetting();

    const btnButton = screen.getByRole("button", { name: "BTN" });
    await user.click(btnButton);

    expect(mockNavigate).not.toHaveBeenCalledWith("/game/next-game/select-btn");
  });

  it("座席をクリックするとプレイヤー編集モーダルが開く", async () => {
    const user = userEvent.setup();
    renderSetting();

    await user.click(screen.getByRole("button", { name: /Alice/ }));

    await waitFor(() => {
      expect(screen.getByTestId("player-edit-modal")).toBeInTheDocument();
    });
  });

  it("モーダルのキャンセルでモーダルが閉じる", async () => {
    const user = userEvent.setup();
    renderSetting();

    await user.click(screen.getByRole("button", { name: /Alice/ }));
    await waitFor(() =>
      expect(screen.getByTestId("player-edit-modal")).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("modal-cancel"));

    expect(screen.queryByTestId("player-edit-modal")).not.toBeInTheDocument();
  });

  it("モーダルの削除ボタンで deletePlayer が呼ばれる", async () => {
    const user = userEvent.setup();
    renderSetting();

    await user.click(screen.getByRole("button", { name: /Alice/ }));
    await waitFor(() =>
      expect(screen.getByTestId("player-edit-modal")).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("modal-delete"));

    expect(mockDeletePlayer).toHaveBeenCalledWith("p1");
  });
});
