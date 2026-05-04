import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { AccountPage } from "./index";

// api/client を mock
vi.mock("../../api/client", () => ({
  api: {
    gameSettings: {
      load: vi.fn(),
    },
  },
}));

// react-router の useNavigate を mock
const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockGameSettings = {
  smallBlind: 100,
  bigBlind: 200,
  minChip: 100,
  bbAnte: false,
};

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    vi.mocked(api.gameSettings.load).mockResolvedValue(mockGameSettings);
  });

  const renderAccountPage = () =>
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

  it("「アカウント」見出しが表示される", () => {
    renderAccountPage();
    expect(screen.getByText("アカウント")).toBeInTheDocument();
  });

  it("アプリバージョン「0.1.0」が表示される", () => {
    renderAccountPage();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
  });

  it("ゲーム設定の SB/BB/MIN CHIP/BB ANTE が表示される", async () => {
    renderAccountPage();
    await waitFor(() => {
      expect(screen.getByText("SB")).toBeInTheDocument();
      expect(screen.getByText("BB")).toBeInTheDocument();
      expect(screen.getByText("MIN CHIP")).toBeInTheDocument();
      expect(screen.getByText("BB ANTE")).toBeInTheDocument();
    });
  });

  it("ゲーム設定の値が正しく表示される", async () => {
    renderAccountPage();
    await waitFor(() => {
      // SB=100 と MIN CHIP=100 で "100" が複数存在するため getAllByText を使用
      expect(screen.getAllByText("100").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("200")).toBeInTheDocument();
      expect(screen.getByText("なし")).toBeInTheDocument();
    });
  });

  it("ゲーム設定の BB ANTE が「あり」の場合に正しく表示される", async () => {
    vi.mocked(api.gameSettings.load).mockResolvedValue({
      ...mockGameSettings,
      bbAnte: true,
    });
    renderAccountPage();
    await waitFor(() => {
      expect(screen.getByText("あり")).toBeInTheDocument();
    });
  });

  it("「ホームへ戻る」ボタンが表示される", () => {
    renderAccountPage();
    expect(screen.getByText("ホームへ戻る")).toBeInTheDocument();
  });

  it('「ホームへ戻る」ボタンをクリックすると "/" に navigate する', async () => {
    const user = userEvent.setup();
    renderAccountPage();

    const button = screen.getByText("ホームへ戻る");
    await user.click(button);

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
