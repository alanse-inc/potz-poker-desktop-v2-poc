import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoModeBoard } from "../domain/auto_game/types";
import {
  AUTO_BOARD_UPDATED_EVENT,
  AutoBoardProvider,
  useAutoBoard,
} from "./auto_board_context";

// @tauri-apps/api/event のモック（emit を含む）
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

// @tauri-apps/api/webviewWindow のモック
const MY_WINDOW_LABEL = "main";
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: vi.fn(() => ({ label: MY_WINDOW_LABEL })),
}));

// モック後にインポート
const { listen, emit } = await import("@tauri-apps/api/event");

const wrapper = ({ children }: { children: ReactNode }) => (
  <AutoBoardProvider>{children}</AutoBoardProvider>
);

function makeBoard(overrides: Partial<AutoModeBoard> = {}): AutoModeBoard {
  return {
    setting: { name: "Test Game" },
    players: [],
    communityCards: [],
    burnCards: [],
    handNumber: 1,
    winners: null,
    ...overrides,
  };
}

describe("AutoBoardProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // デフォルト実装を設定
    vi.mocked(listen).mockResolvedValue(() => {});
    vi.mocked(emit).mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("初期状態: localStorage が空の場合 board は null", () => {
    const { result } = renderHook(() => useAutoBoard(), { wrapper });
    expect(result.current.board).toBeNull();
  });

  it("初期状態: localStorage に board がある場合はそれを返す", () => {
    const board = makeBoard({ handNumber: 5 });
    localStorage.setItem("auto_mode_board", JSON.stringify(board));
    const { result } = renderHook(() => useAutoBoard(), { wrapper });
    expect(result.current.board?.handNumber).toBe(5);
  });

  it("setBoard: state を更新する", () => {
    const { result } = renderHook(() => useAutoBoard(), { wrapper });
    const board = makeBoard({ handNumber: 2 });
    act(() => {
      result.current.setBoard(board);
    });
    expect(result.current.board).toEqual(board);
  });

  it("setBoard: localStorage に保存する", () => {
    const { result } = renderHook(() => useAutoBoard(), { wrapper });
    const board = makeBoard({ handNumber: 3 });
    act(() => {
      result.current.setBoard(board);
    });
    const stored = JSON.parse(
      localStorage.getItem("auto_mode_board") ?? "null",
    ) as AutoModeBoard | null;
    expect(stored?.handNumber).toBe(3);
  });

  it("setBoard: emit を AUTO_BOARD_UPDATED_EVENT で呼ぶ", async () => {
    const { result } = renderHook(() => useAutoBoard(), { wrapper });
    const board = makeBoard({ handNumber: 4 });
    act(() => {
      result.current.setBoard(board);
    });
    await waitFor(() => {
      expect(emit).toHaveBeenCalledWith(AUTO_BOARD_UPDATED_EVENT, {
        board,
        source: MY_WINDOW_LABEL,
      });
    });
  });

  it("resetBoard: board を null にする", () => {
    const board = makeBoard();
    localStorage.setItem("auto_mode_board", JSON.stringify(board));
    const { result } = renderHook(() => useAutoBoard(), { wrapper });
    act(() => {
      result.current.resetBoard();
    });
    expect(result.current.board).toBeNull();
  });

  it("resetBoard: localStorage から削除する", () => {
    const board = makeBoard();
    localStorage.setItem("auto_mode_board", JSON.stringify(board));
    const { result } = renderHook(() => useAutoBoard(), { wrapper });
    act(() => {
      result.current.resetBoard();
    });
    expect(localStorage.getItem("auto_mode_board")).toBeNull();
  });

  it("resetBoard: emit を board: null で呼ぶ", async () => {
    const { result } = renderHook(() => useAutoBoard(), { wrapper });
    act(() => {
      result.current.resetBoard();
    });
    await waitFor(() => {
      expect(emit).toHaveBeenCalledWith(AUTO_BOARD_UPDATED_EVENT, {
        board: null,
        source: MY_WINDOW_LABEL,
      });
    });
  });

  it("マウント時に listen を AUTO_BOARD_UPDATED_EVENT で購読する", async () => {
    renderHook(() => useAutoBoard(), { wrapper });
    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith(
        AUTO_BOARD_UPDATED_EVENT,
        expect.any(Function),
      );
    });
  });

  it("listen イベント受信で board state が更新される（別ウィンドウからのイベント）", async () => {
    let capturedCb:
      | ((e: { payload: { board: AutoModeBoard | null; source?: string } }) => void)
      | undefined;

    vi.mocked(listen).mockImplementation(async (_event, cb) => {
      capturedCb = cb as typeof capturedCb;
      return () => {};
    });

    const { result } = renderHook(() => useAutoBoard(), { wrapper });

    await waitFor(() => {
      expect(listen).toHaveBeenCalledTimes(1);
    });

    const updatedBoard = makeBoard({ handNumber: 99 });
    act(() => {
      capturedCb?.({ payload: { board: updatedBoard, source: "other-window" } });
    });

    await waitFor(() => {
      expect(result.current.board).toEqual(updatedBoard);
    });
  });

  it("listen イベント受信で自ウィンドウからのイベントは無視される", async () => {
    let capturedCb:
      | ((e: { payload: { board: AutoModeBoard | null; source?: string } }) => void)
      | undefined;

    vi.mocked(listen).mockImplementation(async (_event, cb) => {
      capturedCb = cb as typeof capturedCb;
      return () => {};
    });

    const { result } = renderHook(() => useAutoBoard(), { wrapper });

    await waitFor(() => {
      expect(listen).toHaveBeenCalledTimes(1);
    });

    const updatedBoard = makeBoard({ handNumber: 99 });
    act(() => {
      // 自ウィンドウ (MY_WINDOW_LABEL) から来たイベントは無視される
      capturedCb?.({ payload: { board: updatedBoard, source: MY_WINDOW_LABEL } });
    });

    // board は初期値 null のまま変わらない
    expect(result.current.board).toBeNull();
  });

  it("listen イベント受信で null が来ると board が null になる（別ウィンドウからのイベント）", async () => {
    const initialBoard = makeBoard();
    localStorage.setItem("auto_mode_board", JSON.stringify(initialBoard));

    let capturedCb:
      | ((e: { payload: { board: AutoModeBoard | null; source?: string } }) => void)
      | undefined;

    vi.mocked(listen).mockImplementation(async (_event, cb) => {
      capturedCb = cb as typeof capturedCb;
      return () => {};
    });

    const { result } = renderHook(() => useAutoBoard(), { wrapper });

    await waitFor(() => {
      expect(listen).toHaveBeenCalledTimes(1);
    });

    act(() => {
      capturedCb?.({ payload: { board: null, source: "other-window" } });
    });

    await waitFor(() => {
      expect(result.current.board).toBeNull();
    });
  });

  it("アンマウント時に unlisten が呼ばれる", async () => {
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => useAutoBoard(), { wrapper });

    await waitFor(() => {
      expect(listen).toHaveBeenCalledTimes(1);
    });

    unmount();

    await waitFor(() => {
      expect(unlisten).toHaveBeenCalledTimes(1);
    });
  });

  it("AutoBoardProvider 外で useAutoBoard() を呼ぶとエラーになる", () => {
    expect(() => {
      renderHook(() => useAutoBoard());
    }).toThrow("useAutoBoard must be used within AutoBoardProvider");
  });
});
