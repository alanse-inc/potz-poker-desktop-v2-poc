import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TableNameSettings } from "./index";

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

const renderTableNameSettings = () =>
  render(
    <MemoryRouter>
      <TableNameSettings />
    </MemoryRouter>,
  );

describe("TableNameSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue("");
    mockNavigate.mockReset();
  });

  it("「テーブル名設定」の見出しが表示される", () => {
    renderTableNameSettings();
    expect(screen.getByText("テーブル名設定")).toBeInTheDocument();
  });

  it("テキスト入力フィールドが表示される", () => {
    renderTableNameSettings();
    expect(screen.getByPlaceholderText("テーブル名を入力")).toBeInTheDocument();
  });

  it("「保存」「戻る」ボタンが表示される", () => {
    renderTableNameSettings();
    expect(screen.getByText("保存")).toBeInTheDocument();
    expect(screen.getByText("戻る")).toBeInTheDocument();
  });

  it("マウント時に get_table_name が呼ばれる", async () => {
    renderTableNameSettings();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_table_name");
    });
  });

  it("get_table_name の値が入力フィールドに反映される", async () => {
    mockInvoke.mockResolvedValue("メインテーブル");
    renderTableNameSettings();
    await waitFor(() => {
      const input = screen.getByPlaceholderText(
        "テーブル名を入力",
      ) as HTMLInputElement;
      expect(input.value).toBe("メインテーブル");
    });
  });

  it("テキスト未入力時に「(未設定)」プレビューが表示される", () => {
    renderTableNameSettings();
    expect(screen.getByText("(未設定)")).toBeInTheDocument();
  });

  it("テキストを入力するとプレビューに反映される", async () => {
    const user = userEvent.setup();
    renderTableNameSettings();
    const input = screen.getByPlaceholderText("テーブル名を入力");
    await user.type(input, "テスト卓");
    expect(screen.getByText("テスト卓")).toBeInTheDocument();
  });

  it("「保存」をクリックすると set_table_name が呼ばれる", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_table_name") return Promise.resolve("初期値");
      return Promise.resolve(undefined);
    });
    renderTableNameSettings();
    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText("テーブル名を入力") as HTMLInputElement)
          .value,
      ).toBe("初期値");
    });
    await user.click(screen.getByText("保存"));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("set_table_name", {
        name: "初期値",
      });
    });
  });

  it("「戻る」ボタンをクリックすると navigate('/') が呼ばれる", async () => {
    const user = userEvent.setup();
    renderTableNameSettings();
    await user.click(screen.getByText("戻る"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
