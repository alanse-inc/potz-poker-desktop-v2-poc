import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import type { TelopState } from "../../../types";
import { TelopSettings } from "./index";

// api/client を mock
vi.mock("../../../api/client", () => ({
  api: {
    telop: {
      getState: vi.fn(),
      setMessage: vi.fn(),
      setColor: vi.fn(),
      open: vi.fn(),
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

const renderTelopSettings = () =>
  render(
    <MemoryRouter>
      <TelopSettings />
    </MemoryRouter>,
  );

describe("TelopSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルト: getState は空の状態を返す
    vi.mocked(api.telop.getState).mockResolvedValue({
      message: "",
      color: "#000000",
    } as TelopState);
    vi.mocked(api.telop.setMessage).mockResolvedValue(undefined);
    vi.mocked(api.telop.setColor).mockResolvedValue(undefined);
    vi.mocked(api.telop.open).mockResolvedValue(undefined);
    mockNavigate.mockReset();
  });

  it("「テロップ設定」の見出しが表示される", () => {
    renderTelopSettings();
    expect(screen.getByText("テロップ設定")).toBeInTheDocument();
  });

  it("テロップテキスト入力フィールドが表示される", () => {
    renderTelopSettings();
    expect(
      screen.getByPlaceholderText("表示するメッセージを入力"),
    ).toBeInTheDocument();
  });

  it("背景色入力フィールドが表示される", () => {
    renderTelopSettings();
    expect(screen.getByPlaceholderText("#000000")).toBeInTheDocument();
  });

  it("「適用」ボタンが表示される", () => {
    renderTelopSettings();
    expect(screen.getByText("適用")).toBeInTheDocument();
  });

  it("「テロップウィンドウを開く」ボタンが表示される", () => {
    renderTelopSettings();
    expect(screen.getByText("テロップウィンドウを開く")).toBeInTheDocument();
  });

  it("「戻る」ボタンが表示される", () => {
    renderTelopSettings();
    expect(screen.getByText("戻る")).toBeInTheDocument();
  });

  it("マウント時に api.telop.getState() が呼ばれる", async () => {
    renderTelopSettings();

    await waitFor(() => {
      expect(api.telop.getState).toHaveBeenCalledTimes(1);
    });
  });

  it("getState() の値が入力フィールドに反映される", async () => {
    vi.mocked(api.telop.getState).mockResolvedValue({
      message: "テストメッセージ",
      color: "#ff0000",
    });

    renderTelopSettings();

    await waitFor(() => {
      const input = screen.getByPlaceholderText(
        "表示するメッセージを入力",
      ) as HTMLInputElement;
      expect(input.value).toBe("テストメッセージ");
    });
  });

  it("テキスト入力後に「適用」をクリックすると api.telop.setMessage() が呼ばれる", async () => {
    const user = userEvent.setup();
    renderTelopSettings();

    const messageInput = screen.getByPlaceholderText(
      "表示するメッセージを入力",
    );
    await user.clear(messageInput);
    await user.type(messageInput, "新しいメッセージ");

    const applyButton = screen.getByText("適用");
    await user.click(applyButton);

    await waitFor(() => {
      expect(api.telop.setMessage).toHaveBeenCalledWith("新しいメッセージ");
    });
  });

  it("カラー入力後に「適用」をクリックすると api.telop.setColor() が呼ばれる", async () => {
    const user = userEvent.setup();
    renderTelopSettings();

    // getState の解決を待ってから入力（getState が完了した後に state が初期化される）
    await waitFor(() => {
      expect(api.telop.getState).toHaveBeenCalledTimes(1);
    });

    // fireEvent.change でカラーテキスト入力フィールドの値を直接設定
    const colorTextInput = screen.getByPlaceholderText("#000000");
    fireEvent.change(colorTextInput, { target: { value: "#ff5500" } });

    // 値が反映されるのを待つ
    await waitFor(() => {
      expect((colorTextInput as HTMLInputElement).value).toBe("#ff5500");
    });

    const applyButton = screen.getByText("適用");
    await user.click(applyButton);

    await waitFor(() => {
      expect(api.telop.setColor).toHaveBeenCalledWith("#ff5500");
    });
  });

  it("「適用」をクリックすると setMessage と setColor が両方呼ばれる", async () => {
    const user = userEvent.setup();
    renderTelopSettings();

    const applyButton = screen.getByText("適用");
    await user.click(applyButton);

    await waitFor(() => {
      expect(api.telop.setMessage).toHaveBeenCalledTimes(1);
      expect(api.telop.setColor).toHaveBeenCalledTimes(1);
    });
  });

  it("「テロップウィンドウを開く」ボタンをクリックすると api.telop.open() が呼ばれる", async () => {
    const user = userEvent.setup();
    renderTelopSettings();

    const openButton = screen.getByText("テロップウィンドウを開く");
    await user.click(openButton);

    await waitFor(() => {
      expect(api.telop.open).toHaveBeenCalledTimes(1);
    });
  });

  it("「戻る」ボタンをクリックすると navigate('/') が呼ばれる", async () => {
    const user = userEvent.setup();
    renderTelopSettings();

    const backButton = screen.getByText("戻る");
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
