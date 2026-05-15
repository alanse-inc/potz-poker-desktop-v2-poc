import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceInputStatusEvent } from "../types/voice_input";

const { mockStart, mockStop, mockOnStatus, statusRef } = vi.hoisted(() => {
  const mockStart = vi.fn(async () => {});
  const mockStop = vi.fn();
  const statusRef = { current: "listening" as string };
  const mockOnStatus = vi.fn((cb: (event: VoiceInputStatusEvent) => void) => {
    void cb;
    return () => {};
  });
  return {
    mockStart,
    mockStop,
    mockOnStatus,
    statusRef,
  };
});

vi.mock("../services/voice_input_service", () => ({
  voiceInputService: {
    get status() {
      return statusRef.current;
    },
    start: mockStart,
    stop: mockStop,
    onStatus: mockOnStatus,
  },
}));

vi.mock("../services/voice_input_constants", () => ({
  STATUS_COLORS: {
    stopped: "bg-gray-500",
    listening: "bg-green-500",
    speaking: "bg-blue-500",
    processing: "bg-yellow-500",
    error: "bg-red-500",
  },
}));

import { VoiceInputIndicator } from "./voice_input_indicator";

describe("VoiceInputIndicator - マイクトグルボタン", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusRef.current = "listening";
    mockOnStatus.mockImplementation(
      (cb: (event: VoiceInputStatusEvent) => void) => {
        void cb;
        return () => {};
      },
    );
  });

  it("listening 状態ではマイク OFF ボタン (MicIcon) が描画される", () => {
    render(<VoiceInputIndicator />);
    screen.getByRole("button", { name: "マイクをオフにする" });
  });

  it("listening 状態の OFF クリックは stop() を呼ぶ", () => {
    statusRef.current = "listening";
    render(<VoiceInputIndicator />);
    const button = screen.getByRole("button", { name: "マイクをオフにする" });
    fireEvent.click(button);
    expect(mockStop.mock.calls.length).toBe(1);
    expect(mockStart.mock.calls.length).toBe(0);
  });

  it("stopped 状態では ON ボタン (MicOffIcon) が描画される", () => {
    statusRef.current = "stopped";
    render(<VoiceInputIndicator />);
    screen.getByRole("button", { name: "マイクをオンにする" });
  });

  it("stopped 状態で ON クリックは start() を呼ぶ", () => {
    statusRef.current = "stopped";
    render(<VoiceInputIndicator />);
    const button = screen.getByRole("button", { name: "マイクをオンにする" });
    fireEvent.click(button);
    expect(mockStart.mock.calls.length).toBe(1);
    expect(mockStop.mock.calls.length).toBe(0);
  });

  it("マイクトグルボタンに type=button が付与されている", () => {
    render(<VoiceInputIndicator />);
    const button = screen.getByRole("button", {
      name: "マイクをオフにする",
    }) as HTMLButtonElement;
    expect(button.type).toBe("button");
  });

  it("stopped 状態でも右下バッジが表示される (return null しない)", () => {
    statusRef.current = "stopped";
    render(<VoiceInputIndicator />);
    // マイクトグルボタンが存在すれば stopped 時に null を返していない
    screen.getByRole("button", { name: "マイクをオンにする" });
  });

  it("listening 状態の連打で stop が 3 回呼ばれ start は呼ばれない", () => {
    statusRef.current = "listening";
    render(<VoiceInputIndicator />);
    const button = screen.getByRole("button", { name: "マイクをオフにする" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mockStop.mock.calls.length).toBe(3);
    expect(mockStart.mock.calls.length).toBe(0);
  });
});
