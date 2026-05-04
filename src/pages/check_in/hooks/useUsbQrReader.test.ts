import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsbQrReader } from "./useUsbQrReader";

const fireKeyDown = (key: string, options: Partial<KeyboardEventInit> = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    ...options,
  });
  act(() => {
    window.dispatchEvent(event);
  });
};

describe("useUsbQrReader", () => {
  let onRead: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onRead = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("基本動作", () => {
    it("enabled=false の場合、キー入力を無視する", () => {
      renderHook(() => useUsbQrReader(onRead, false));

      fireKeyDown("h");
      fireKeyDown("i");
      fireKeyDown("Enter");

      expect(onRead).not.toHaveBeenCalled();
    });

    it("文字キーをバッファリングし、Enter でコールバックを発火する", () => {
      renderHook(() => useUsbQrReader(onRead, true));

      fireKeyDown("h");
      fireKeyDown("t");
      fireKeyDown("t");
      fireKeyDown("p");
      fireKeyDown("Enter");

      expect(onRead).toHaveBeenCalledWith("http");
    });

    it("Enterのみ（バッファが空）の場合、コールバックを発火しない", () => {
      renderHook(() => useUsbQrReader(onRead, true));

      fireKeyDown("Enter");

      expect(onRead).not.toHaveBeenCalled();
    });

    it("Shift, Ctrl などの制御キーはバッファに追加されない", () => {
      renderHook(() => useUsbQrReader(onRead, true));

      fireKeyDown("Shift");
      fireKeyDown("Control");
      fireKeyDown("a");
      fireKeyDown("Enter");

      expect(onRead).toHaveBeenCalledWith("a");
    });

    it("500ms 入力がなければバッファがクリアされる", () => {
      renderHook(() => useUsbQrReader(onRead, true));

      fireKeyDown("a");
      fireKeyDown("b");

      act(() => {
        vi.advanceTimersByTime(500);
      });

      fireKeyDown("Enter");

      expect(onRead).not.toHaveBeenCalled();
    });
  });

  describe("Windows IME isComposing チェック", () => {
    it("isComposing=true の場合、キー入力を無視する", () => {
      renderHook(() => useUsbQrReader(onRead, true));

      fireKeyDown("a", { isComposing: true });
      fireKeyDown("b", { isComposing: true });
      fireKeyDown("Enter");

      expect(onRead).not.toHaveBeenCalled();
    });

    it("isComposing=false の場合、通常どおりバッファリングする", () => {
      renderHook(() => useUsbQrReader(onRead, true));

      fireKeyDown("a", { isComposing: false });
      fireKeyDown("b", { isComposing: false });
      fireKeyDown("Enter");

      expect(onRead).toHaveBeenCalledWith("ab");
    });

    it("IME変換中の入力後、変換完了後の入力はバッファリングされる", () => {
      renderHook(() => useUsbQrReader(onRead, true));

      // IME変換中: 無視
      fireKeyDown("あ", { isComposing: true });
      // 変換完了後: バッファリング
      fireKeyDown("a", { isComposing: false });
      fireKeyDown("b", { isComposing: false });
      fireKeyDown("Enter");

      expect(onRead).toHaveBeenCalledWith("ab");
    });

    it("isComposing=true の Enter は無視される（バッファが空でもコールバックは呼ばれない）", () => {
      renderHook(() => useUsbQrReader(onRead, true));

      fireKeyDown("a");
      fireKeyDown("b");
      fireKeyDown("Enter", { isComposing: true });

      expect(onRead).not.toHaveBeenCalled();
    });
  });

  describe("フォーム要素フォーカス", () => {
    it("INPUT にフォーカスがある場合、キー入力を無視する", () => {
      renderHook(() => useUsbQrReader(onRead, true));

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", {
        key: "a",
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: input });
      act(() => {
        window.dispatchEvent(event);
      });
      fireKeyDown("Enter");

      expect(onRead).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });
  });

  describe("enabled の切り替え", () => {
    it("enabled が false になるとバッファがクリアされる", () => {
      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) => useUsbQrReader(onRead, enabled),
        { initialProps: { enabled: true } },
      );

      fireKeyDown("a");
      fireKeyDown("b");

      // enabled を false に変更 → バッファクリア
      rerender({ enabled: false });

      // 再度 enabled を true にして Enter
      rerender({ enabled: true });
      fireKeyDown("Enter");

      expect(onRead).not.toHaveBeenCalled();
    });
  });
});
