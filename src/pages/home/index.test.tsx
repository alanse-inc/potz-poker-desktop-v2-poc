import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import * as licenseModule from "../../utils/license";
import { Home } from "./index";

vi.mock("../../api/client", () => ({
  api: {
    telop: {
      open: vi.fn(),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../utils/license", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/license")>();
  return {
    ...actual,
    getUserLicense: vi.fn(() => ({
      isValid: true,
      type: "paid",
      status: "active",
    })),
  };
});

const mockUseAuth = vi.fn();
vi.mock("../../contexts/auth_context", () => ({
  useAuth: () => mockUseAuth(),
}));

const authenticatedAuth = {
  isSignedIn: true,
  isInitializing: false,
  isLoggingIn: false,
  authError: null,
  user: {
    sub: "auth0|test",
    name: "Test User",
    email: "test@example.com",
    "https://potzpoker.com/license_type": "paid",
    "https://potzpoker.com/subscription_status": "active",
  },
  loginWithPassword: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
};

const unauthenticatedAuth = {
  isSignedIn: false,
  isInitializing: false,
  isLoggingIn: false,
  authError: null,
  user: null,
  loginWithPassword: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
};

const renderHome = () =>
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );

describe("Home (E2E モード: VITE_E2E=true)", () => {
  beforeEach(() => {
    vi.mocked(api.telop.open).mockResolvedValue(undefined);
    mockNavigate.mockReset();
    mockUseAuth.mockReturnValue(authenticatedAuth);
    vi.mocked(licenseModule.getUserLicense).mockReturnValue({
      isValid: true,
      type: "paid",
      status: "active",
    } as licenseModule.LicenseInfo);
    vi.stubEnv("VITE_E2E", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

describe("Home 認証ゲート (通常モード)", () => {
  beforeEach(() => {
    vi.mocked(api.telop.open).mockReset();
    vi.mocked(api.telop.open).mockResolvedValue(undefined);
    mockNavigate.mockReset();
    vi.unstubAllEnvs();
  });

  describe("初期化中 (isInitializing=true)", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        ...unauthenticatedAuth,
        isInitializing: true,
      });
    });

    it("ローディングスピナーが表示される", () => {
      renderHome();
      expect(screen.queryByText("POTZ POKER")).not.toBeInTheDocument();
      expect(screen.queryByText("WELCOME POTZ!")).not.toBeInTheDocument();
    });

    it("スナップショット: 初期化中", () => {
      const { container } = renderHome();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe("ログイン中 (isLoggingIn=true)", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        ...unauthenticatedAuth,
        isLoggingIn: true,
      });
    });

    it("ローディングスピナーが表示される", () => {
      renderHome();
      expect(screen.queryByText("POTZ POKER")).not.toBeInTheDocument();
      expect(screen.queryByText("WELCOME POTZ!")).not.toBeInTheDocument();
    });
  });

  describe("未ログイン (isSignedIn=false)", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(unauthenticatedAuth);
    });

    it("カスタムログインフォームが表示される", () => {
      renderHome();
      expect(screen.getByText("WELCOME POTZ!")).toBeInTheDocument();
    });

    it("ID ラベルが表示される", () => {
      renderHome();
      expect(screen.getByLabelText("ID")).toBeInTheDocument();
    });

    it("PASS WORD ラベルが表示される", () => {
      renderHome();
      expect(screen.getByLabelText("PASS WORD")).toBeInTheDocument();
    });

    it("LOGIN ボタンが表示される", () => {
      renderHome();
      expect(screen.getByRole("button", { name: "LOGIN" })).toBeInTheDocument();
    });

    it("POTZ POKER メニューは表示されない", () => {
      renderHome();
      expect(screen.queryByText("POTZ POKER")).not.toBeInTheDocument();
    });

    it("スナップショット: ログインフォーム", () => {
      const { container } = renderHome();
      expect(container.firstChild).toMatchSnapshot();
    });

    it("authError がある場合エラーメッセージが表示される", () => {
      mockUseAuth.mockReturnValue({
        ...unauthenticatedAuth,
        authError: "IDまたはパスワードが間違っています",
      });
      renderHome();
      expect(
        screen.getByText("IDまたはパスワードが間違っています"),
      ).toBeInTheDocument();
    });

    it("LOGIN ボタンクリックで loginWithPassword が呼ばれる", async () => {
      const mockLogin = vi.fn().mockResolvedValue(undefined);
      mockUseAuth.mockReturnValue({
        ...unauthenticatedAuth,
        loginWithPassword: mockLogin,
      });
      const user = userEvent.setup();
      renderHome();

      await user.type(screen.getByLabelText("ID"), "testuser");
      await user.type(screen.getByLabelText("PASS WORD"), "password123");
      await user.click(screen.getByRole("button", { name: "LOGIN" }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith("testuser", "password123");
      });
    });
  });

  describe("ライセンス無効 (isSignedIn=true, license.isValid=false)", () => {
    beforeEach(() => {
      vi.mocked(licenseModule.getUserLicense).mockReturnValue({
        isValid: false,
        type: "none",
        status: "inactive",
      } as licenseModule.LicenseInfo);
      mockUseAuth.mockReturnValue(authenticatedAuth);
    });

    it("ライセンスエラーメッセージが表示される", () => {
      renderHome();
      expect(
        screen.getByText(
          /現在ご利用のアカウントではライセンスが確認できません/,
        ),
      ).toBeInTheDocument();
    });

    it("サポートリンクが表示される", () => {
      renderHome();
      expect(
        screen.getByText("https://potz-pro.com/poker/"),
      ).toBeInTheDocument();
    });

    it("POTZ POKER メニューは表示されない", () => {
      renderHome();
      expect(screen.queryByText("POTZ POKER")).not.toBeInTheDocument();
    });

    it("ログインフォームは表示されない", () => {
      renderHome();
      expect(screen.queryByText("WELCOME POTZ!")).not.toBeInTheDocument();
    });

    it("スナップショット: ライセンスエラー", () => {
      const { container } = renderHome();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe("認証・ライセンス共に有効 (isSignedIn=true, license.isValid=true)", () => {
    beforeEach(() => {
      vi.mocked(licenseModule.getUserLicense).mockReturnValue({
        isValid: true,
        type: "paid",
        status: "active",
      } as licenseModule.LicenseInfo);
      mockUseAuth.mockReturnValue(authenticatedAuth);
    });

    it("POTZ POKER タイトルが表示される", () => {
      renderHome();
      expect(screen.getByText("POTZ POKER")).toBeInTheDocument();
    });

    it("「新規ゲーム設定」ボタンが表示される", () => {
      renderHome();
      expect(screen.getByText("新規ゲーム設定")).toBeInTheDocument();
    });

    it("ログインフォームは表示されない", () => {
      renderHome();
      expect(screen.queryByText("WELCOME POTZ!")).not.toBeInTheDocument();
    });

    it("ライセンスエラーは表示されない", () => {
      renderHome();
      expect(
        screen.queryByText(
          /現在ご利用のアカウントではライセンスが確認できません/,
        ),
      ).not.toBeInTheDocument();
    });

    it("スナップショット: 正常メニュー", () => {
      const { container } = renderHome();
      expect(container.firstChild).toMatchSnapshot();
    });

    it("「新規ゲーム設定」クリックで /game/setting に navigate する", async () => {
      const user = userEvent.setup();
      renderHome();

      await user.click(screen.getByText("新規ゲーム設定"));
      expect(mockNavigate).toHaveBeenCalledWith("/game/setting");
    });

    it("「テロップウィンドウを開く」クリックで api.telop.open() が呼ばれる", async () => {
      const user = userEvent.setup();
      renderHome();

      await user.click(screen.getByText("テロップウィンドウを開く"));
      await waitFor(() => {
        expect(api.telop.open).toHaveBeenCalledTimes(1);
      });
    });
  });
});
