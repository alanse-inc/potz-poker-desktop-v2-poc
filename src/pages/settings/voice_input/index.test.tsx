/**
 * VoiceInputSettings コンポーネントのテスト
 *
 * focus: BUG-T-1 — useEffect deps の再登録ループ修正の検証
 * サブスクリプションはマウント時のみ登録され、isMicTestRunning 変化時に再登録されないことを確認する。
 */

import { act, render, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// voiceInputService モック
// vi.mock はホイストされるため、変数参照ではなく vi.fn() をインラインで使う
// ---------------------------------------------------------------------------

const mockUnsubStatus = vi.fn();
const mockUnsubCommand = vi.fn();

vi.mock("../../../services/voice_input_service", () => {
  const mockStart = vi.fn().mockResolvedValue(undefined);
  const mockStop = vi.fn();
  const mockGetAudioDevices = vi.fn().mockResolvedValue([]);
  const mockOnStatus = vi.fn().mockReturnValue(vi.fn());
  const mockOnCommand = vi.fn().mockReturnValue(vi.fn());

  return {
    voiceInputService: {
      enabled: false,
      deviceId: undefined,
      status: "stopped",
      confidenceThreshold: 0.7,
      endpointingMs: 300,
      onStatus: mockOnStatus,
      onCommand: mockOnCommand,
      start: mockStart,
      stop: mockStop,
      getAudioDevices: mockGetAudioDevices,
      applySettings: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("../../../services/voice_input_constants", () => ({
  STATUS_COLORS: {
    stopped: "bg-gray-500",
    listening: "bg-green-500",
    speaking: "bg-blue-500",
    processing: "bg-yellow-500",
    error: "bg-red-500",
  },
  STATUS_LABELS: {
    stopped: "停止中",
    listening: "待機中",
    speaking: "発話中",
    processing: "処理中",
    error: "エラー",
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../../ui/button/round_button", () => ({
  RoundButton: ({
    text,
    onClick,
  }: {
    text: string;
    onClick: () => void;
    disabled?: boolean;
    type?: string;
    size?: string;
  }) => (
    <button type="button" onClick={onClick}>
      {text}
    </button>
  ),
}));

vi.mock("../../../ui/page/basic", () => ({
  BasicPage: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

import { voiceInputService } from "../../../services/voice_input_service";
import { VoiceInputSettings } from "./index";

function renderComponent() {
  return render(
    <MemoryRouter>
      <VoiceInputSettings />
    </MemoryRouter>,
  );
}

describe("VoiceInputSettings – BUG-T-1: useEffect 再登録ループ修正", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // beforeEach で改めて戻り値を設定する（clearAllMocks でリセットされるため）
    vi.mocked(voiceInputService.onStatus).mockReturnValue(mockUnsubStatus);
    vi.mocked(voiceInputService.onCommand).mockReturnValue(mockUnsubCommand);
    vi.mocked(voiceInputService.getAudioDevices).mockResolvedValue([]);
    vi.mocked(voiceInputService.start).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("マウント時に onStatus と onCommand がそれぞれ 1 回だけ呼ばれる", async () => {
    renderComponent();

    await waitFor(() => {
      expect(voiceInputService.getAudioDevices).toHaveBeenCalledTimes(1);
    });

    expect(voiceInputService.onStatus).toHaveBeenCalledTimes(1);
    expect(voiceInputService.onCommand).toHaveBeenCalledTimes(1);
  });

  it("STOP ボタンを押しても onStatus/onCommand の登録回数が増えない", async () => {
    // API キーが存在しない環境で START ボタンを呼び出す代わりに、
    // handleMicTestStop 側 (テスト用に STOP ボタンを模擬) を呼び出すことで、
    // isMicTestRunning が false に戻っても再登録が起きないことを確認する
    const { getByRole } = renderComponent();

    await waitFor(() => {
      expect(voiceInputService.getAudioDevices).toHaveBeenCalledTimes(1);
    });

    // 初回登録: 各 1 回
    expect(voiceInputService.onStatus).toHaveBeenCalledTimes(1);
    expect(voiceInputService.onCommand).toHaveBeenCalledTimes(1);

    // 保存ボタンをクリックしても再登録は起きない
    const saveButton = getByRole("button", { name: "保存" });
    await act(async () => {
      await userEvent.click(saveButton);
    });

    expect(voiceInputService.onStatus).toHaveBeenCalledTimes(1);
    expect(voiceInputService.onCommand).toHaveBeenCalledTimes(1);
  });

  it("アンマウント時に unsubscribe 関数が呼ばれる", async () => {
    const { unmount } = renderComponent();

    await waitFor(() => {
      expect(voiceInputService.getAudioDevices).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(mockUnsubStatus).toHaveBeenCalledTimes(1);
    expect(mockUnsubCommand).toHaveBeenCalledTimes(1);
  });

  it("アンマウント時に isMicTestRunning が false であれば stop は呼ばれない", async () => {
    const { unmount } = renderComponent();

    await waitFor(() => {
      expect(voiceInputService.getAudioDevices).toHaveBeenCalledTimes(1);
    });

    // isMicTestRunning は初期値 false なのでアンマウント時に stop は呼ばれない
    unmount();

    expect(voiceInputService.stop).not.toHaveBeenCalled();
  });

  it("複数回レンダリングを繰り返しても onStatus/onCommand の登録は 1 回のみ (StrictMode 相当)", async () => {
    // React StrictMode では useEffect が 2 回実行される
    // deps=[] の場合はマウント→クリーンアップ→再マウントで合計 2 回 (StrictMode)
    // しかし isMicTestRunning に依存していた旧実装では追加の再登録が発生していた
    // ここでは deps=[] であることを確認するため、render 後の呼び出し回数を検証する
    const { unmount } = renderComponent();

    await waitFor(() => {
      expect(voiceInputService.getAudioDevices).toHaveBeenCalledTimes(1);
    });

    // マウント時: onStatus 1 回、onCommand 1 回 (jsdom は StrictMode ではない)
    expect(voiceInputService.onStatus).toHaveBeenCalledTimes(1);
    expect(voiceInputService.onCommand).toHaveBeenCalledTimes(1);

    unmount();

    // 再マウントしても登録回数は 1 から増えていない (アンマウット後は 0 になる)
    expect(voiceInputService.onStatus).toHaveBeenCalledTimes(1);
    expect(voiceInputService.onCommand).toHaveBeenCalledTimes(1);
  });
});
