import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManualModeInitializeBoardCommand } from "../../../../contexts/initialize_board_command_context";
import { NextGameSelectBtn } from "./index";

vi.mock("../../../../hooks/useAutoScale", () => ({
  useAutoScale: () => ({
    containerRef: { current: null },
    contentRef: { current: null },
  }),
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
const mockUpdatePlayer = vi.fn();

vi.mock("../../../../contexts/initialize_board_command_context", () => ({
  useInitializeBoardCommand: () => ({
    initializeBoardCommand: mockCommand,
    isStartable: true,
    updateInitializeBoardSetting: vi.fn(),
    updatePlayer: mockUpdatePlayer,
    deletePlayer: vi.fn(),
    updateInitializeBoardSettingForDevelopment: vi.fn(),
  }),
}));

const makeCommand = (): ManualModeInitializeBoardCommand => ({
  kind: "initializeBoard",
  input: {
    players: [
      {
        id: "p1",
        name: "Alice",
        status: "active",
        stack: 10000,
        position: null,
        seat: 1,
      },
      {
        id: "p2",
        name: "Bob",
        status: "active",
        stack: 9000,
        position: null,
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
  },
});

const renderSelectBtn = () =>
  render(
    <MemoryRouter>
      <NextGameSelectBtn />
    </MemoryRouter>,
  );

describe("NextGameSelectBtn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommand = makeCommand();
  });

  it("プレイヤー名が表示される", () => {
    renderSelectBtn();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("ヘッダーに BTN 選択指示が表示される", () => {
    renderSelectBtn();
    expect(screen.getByText("BTNを選択してください")).toBeInTheDocument();
  });

  it("プレイヤーをクリックすると updatePlayer が呼ばれ navigate(-1) する", async () => {
    const user = userEvent.setup();
    renderSelectBtn();

    const aliceButton = screen.getByRole("button", { name: /Alice/ });
    await user.click(aliceButton);

    expect(mockUpdatePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", position: "btn" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("BACK ボタンをクリックすると navigate(-1) が呼ばれる", async () => {
    const user = userEvent.setup();
    renderSelectBtn();

    const backButton = screen.getByText("BACK");
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("存在しない座席をクリックしても updatePlayer が呼ばれない", async () => {
    renderSelectBtn();
    expect(mockUpdatePlayer).not.toHaveBeenCalled();
  });
});
