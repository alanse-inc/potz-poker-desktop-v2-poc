/**
 * @vitest-environment jsdom
 */
import { listen } from "@tauri-apps/api/event";
import { act, renderHook } from "@testing-library/react";
import toast from "react-hot-toast";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../contexts/auth_context";
import { updateDeviceProperties } from "../../services/analytics";

// --- モック ---

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../services/analytics", () => ({
  updateDeviceProperties: vi.fn(),
}));

const mockUser: User = { sub: "user-1", name: "Test User" };
let mockAuthValue = { user: null as User | null, isSignedIn: false };

vi.mock("../../contexts/auth_context", () => ({
  useAuth: () => mockAuthValue,
}));

// --- テスト ---

describe("useSensorConnectionToast", () => {
  type ListenHandler = (e: { payload: unknown }) => void;
  let capturedSerialHandler: ListenHandler | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedSerialHandler = undefined;
    mockAuthValue = { user: null, isSignedIn: false };

    vi.mocked(listen).mockImplementation(
      async (eventName, handler: ListenHandler) => {
        if (eventName === "serial_status_updated") {
          capturedSerialHandler = handler;
        }
        return () => {};
      },
    );
  });

  async function setup() {
    const { useSensorConnectionToast } = await import(
      "./use_sensor_connection_toast"
    );
    const result = renderHook(() => useSensorConnectionToast());
    await vi.waitFor(() => expect(capturedSerialHandler).toBeDefined());
    return result;
  }

  it("接続イベント受信時に成功トーストを表示する", async () => {
    await setup();

    act(() => {
      capturedSerialHandler?.({
        payload: { connected: true, portName: "/dev/tty.usbmodem1234" },
      });
    });

    expect(toast.success).toHaveBeenCalledWith("センサーと接続しました");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("接続 → 切断で切断トーストを表示する", async () => {
    await setup();

    act(() => {
      capturedSerialHandler?.({
        payload: { connected: true, portName: "/dev/tty.usbmodem1234" },
      });
    });
    act(() => {
      capturedSerialHandler?.({
        payload: { connected: false, portName: null },
      });
    });

    expect(toast.error).toHaveBeenCalledWith("センサーとの接続が切れました");
  });

  it("接続中かつユーザーあり・portName ありで updateDeviceProperties を呼ぶ", async () => {
    mockAuthValue = { user: mockUser, isSignedIn: true };
    await setup();

    act(() => {
      capturedSerialHandler?.({
        payload: { connected: true, portName: "COM3" },
      });
    });

    expect(updateDeviceProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        device_serial_number: "COM3",
        app_version: expect.any(String),
        os: expect.any(String),
      }),
    );
  });

  it("ユーザーが null の場合は updateDeviceProperties を呼ばない", async () => {
    mockAuthValue = { user: null, isSignedIn: false };
    await setup();

    act(() => {
      capturedSerialHandler?.({
        payload: { connected: true, portName: "COM3" },
      });
    });

    expect(updateDeviceProperties).not.toHaveBeenCalled();
  });

  it("切断状態では updateDeviceProperties を呼ばない", async () => {
    mockAuthValue = { user: mockUser, isSignedIn: true };
    await setup();

    act(() => {
      capturedSerialHandler?.({
        payload: { connected: false, portName: null },
      });
    });

    expect(updateDeviceProperties).not.toHaveBeenCalled();
  });

  it("portName が null の場合は updateDeviceProperties を呼ばない", async () => {
    mockAuthValue = { user: mockUser, isSignedIn: true };
    await setup();

    act(() => {
      capturedSerialHandler?.({
        payload: { connected: true, portName: null },
      });
    });

    expect(updateDeviceProperties).not.toHaveBeenCalled();
  });

  it("connection-status-updated 以外のイベントはトーストを出さない", async () => {
    await setup();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("アンマウント時に listen のクリーンアップが実行される", async () => {
    const unlistenFn = vi.fn();
    vi.mocked(listen).mockImplementation(async () => unlistenFn);

    const { useSensorConnectionToast } = await import(
      "./use_sensor_connection_toast"
    );
    const { unmount } = renderHook(() => useSensorConnectionToast());

    await vi.waitFor(() =>
      expect(vi.mocked(listen).mock.calls.length).toBeGreaterThanOrEqual(1),
    );

    unmount();

    await vi.waitFor(() => expect(unlistenFn).toHaveBeenCalled());
  });
});
