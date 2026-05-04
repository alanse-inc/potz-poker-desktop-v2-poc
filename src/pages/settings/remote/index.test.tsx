import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteSettings } from "./index";

vi.mock("react-qr-code", () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="qr-code" data-value={value} />
  ),
}));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderRemoteSettings = () =>
  render(
    <MemoryRouter>
      <RemoteSettings />
    </MemoryRouter>,
  );

describe("RemoteSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue("");
    mockNavigate.mockReset();
  });

  it("「リモート接続」の見出しが表示される", async () => {
    renderRemoteSettings();
    await waitFor(() => {
      expect(screen.getByText("リモート接続")).toBeInTheDocument();
    });
  });

  it("ロード完了後に接続URLが表示される", async () => {
    renderRemoteSettings();
    await waitFor(() => {
      expect(screen.getByText("http://localhost:8080")).toBeInTheDocument();
    });
  });

  it("ロード完了後に QR コードが表示される", async () => {
    renderRemoteSettings();
    await waitFor(() => {
      expect(screen.getByTestId("qr-code")).toBeInTheDocument();
    });
  });

  it("「戻る」ボタンをクリックすると navigate('/') が呼ばれる", async () => {
    const user = userEvent.setup();
    renderRemoteSettings();
    await waitFor(() => {
      expect(screen.getByText("戻る")).toBeInTheDocument();
    });
    await user.click(screen.getByText("戻る"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("テーブル名がある場合は表示される", async () => {
    mockInvoke.mockResolvedValue("メインテーブル");
    renderRemoteSettings();
    await waitFor(() => {
      expect(screen.getByText("メインテーブル")).toBeInTheDocument();
    });
  });

  it("コピーボタンが表示される", async () => {
    renderRemoteSettings();
    await waitFor(() => {
      expect(screen.getByLabelText("接続URLをコピー")).toBeInTheDocument();
    });
  });
});
