import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { Home } from "./index";

// api/client を mock
vi.mock("../../api/client", () => ({
  api: {
    telop: {
      open: vi.fn(),
    },
  },
}));

// useAuth を mock して AuthProvider 依存を排除
vi.mock("../../contexts/auth_context", () => ({
  useAuth: () => ({
    isSignedIn: false,
    isInitializing: false,
    isLoggingIn: false,
    authError: null,
    user: null,
    loginWithPassword: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
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

describe("Home", () => {
  beforeEach(() => {
    vi.mocked(api.telop.open).mockResolvedValue(undefined);
    mockNavigate.mockReset();
  });

  const renderHome = () =>
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

  it("タイトル 'POTZ POKER' が表示される", () => {
    renderHome();
    expect(screen.getByText("POTZ POKER")).toBeInTheDocument();
  });

  it("「新規ゲーム設定」ボタンが表示される", () => {
    renderHome();
    expect(screen.getByText("新規ゲーム設定")).toBeInTheDocument();
  });

  it("「テロップウィンドウを開く」ボタンが表示される", () => {
    renderHome();
    expect(screen.getByText("テロップウィンドウを開く")).toBeInTheDocument();
  });

  it("「テロップ設定」ボタンが表示される", () => {
    renderHome();
    expect(screen.getByText("テロップ設定")).toBeInTheDocument();
  });

  it("「テロップウィンドウを開く」ボタンをクリックすると api.telop.open() が呼ばれる", async () => {
    const user = userEvent.setup();
    renderHome();

    const button = screen.getByText("テロップウィンドウを開く");
    await user.click(button);

    await waitFor(() => {
      expect(api.telop.open).toHaveBeenCalledTimes(1);
    });
  });

  it("「新規ゲーム設定」ボタンをクリックすると /game/setting に navigate する", async () => {
    const user = userEvent.setup();
    renderHome();

    const button = screen.getByText("新規ゲーム設定");
    await user.click(button);

    expect(mockNavigate).toHaveBeenCalledWith("/game/setting");
  });

  it("「テロップ設定」ボタンをクリックすると /settings/telop に navigate する", async () => {
    const user = userEvent.setup();
    renderHome();

    const button = screen.getByText("テロップ設定");
    await user.click(button);

    expect(mockNavigate).toHaveBeenCalledWith("/settings/telop");
  });

  it("「アカウント」ボタンが表示される", () => {
    renderHome();
    expect(screen.getByText("アカウント")).toBeInTheDocument();
  });

  it("「アカウント」ボタンをクリックすると /account に navigate する", async () => {
    const user = userEvent.setup();
    renderHome();

    const button = screen.getByText("アカウント");
    await user.click(button);

    expect(mockNavigate).toHaveBeenCalledWith("/account");
  });
});
