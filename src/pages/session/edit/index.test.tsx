import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as backendModule from "../../../api/backend";
import { SessionEdit } from "./index";

// backend モジュールをまとめてモック
vi.mock("../../../api/backend", () => ({
  getGameEventDetail: vi.fn(),
  updateGameEvent: vi.fn(),
}));

// react-router の useNavigate をモック
const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const MOCK_SESSION = {
  gameEventId: "event00000000001",
  venueId: "e2e00000000000b0",
  gameTableId: "table0000000001",
  gameRule: "texas_holdem" as const,
  gameFormat: "ring_game" as const,
  status: "started" as const,
  gameName: "テストゲーム",
  defaultStack: null,
  miniChip: 100,
  smallBlind: 100,
  bigBlind: 200,
  anteRule: "none" as const,
  blindExceptionRule: "dead_button" as const,
  startDate: "2024-01-01",
  startedAt: "2024-01-01T00:00:00Z",
  finishedAt: null,
  startedTableId: null,
};

const MOCK_SESSION_DETAIL = {
  ...MOCK_SESSION,
  sessions: [],
};

/** state を持つ遷移でレンダリングするヘルパー */
function renderWithState(session = MOCK_SESSION) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: `/session/edit/${session.gameEventId}`,
          state: { session },
        },
      ]}
    >
      <Routes>
        <Route path="/session/edit/:id" element={<SessionEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** state なし (API ロード) でレンダリングするヘルパー */
function renderWithoutState() {
  return render(
    <MemoryRouter
      initialEntries={[`/session/edit/${MOCK_SESSION.gameEventId}`]}
    >
      <Routes>
        <Route path="/session/edit/:id" element={<SessionEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SessionEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    vi.mocked(backendModule.getGameEventDetail).mockResolvedValue(
      MOCK_SESSION_DETAIL,
    );
    vi.mocked(backendModule.updateGameEvent).mockResolvedValue(MOCK_SESSION);
  });

  it("state からセッション情報を取得してフォームが表示される", async () => {
    renderWithState();
    await waitFor(() => {
      expect(screen.getByDisplayValue("テストゲーム")).toBeInTheDocument();
    });
  });

  it("state がない場合は API からセッション情報を取得する", async () => {
    renderWithoutState();
    await waitFor(() => {
      expect(backendModule.getGameEventDetail).toHaveBeenCalledWith(
        MOCK_SESSION.gameEventId,
      );
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue("テストゲーム")).toBeInTheDocument();
    });
  });

  it("ring_game の場合は「Ring Game セッション編集」タイトルが表示される", async () => {
    renderWithState();
    await waitFor(() => {
      expect(screen.getByText("Ring Game セッション編集")).toBeInTheDocument();
    });
  });

  it("tournament の場合は「Tournament セッション編集」タイトルが表示される", async () => {
    renderWithState({ ...MOCK_SESSION, gameFormat: "tournament" });
    await waitFor(() => {
      expect(screen.getByText("Tournament セッション編集")).toBeInTheDocument();
    });
  });

  it("「保存」ボタンをクリックすると updateGameEvent が呼ばれる", async () => {
    const user = userEvent.setup();
    renderWithState();

    await waitFor(() => {
      expect(screen.getByText("保存")).toBeInTheDocument();
    });

    await user.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(backendModule.updateGameEvent).toHaveBeenCalledWith(
        MOCK_SESSION.gameEventId,
        expect.objectContaining({ name: "テストゲーム" }),
      );
    });
  });

  it("保存成功後に /session/list に navigate する", async () => {
    const user = userEvent.setup();
    renderWithState();

    await waitFor(() => {
      expect(screen.getByText("保存")).toBeInTheDocument();
    });

    await user.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/session/list");
    });
  });

  it("「戻る」ボタンをクリックすると /session/list に navigate する", async () => {
    const user = userEvent.setup();
    renderWithState();

    await waitFor(() => {
      expect(screen.getByText("戻る")).toBeInTheDocument();
    });

    await user.click(screen.getByText("戻る"));

    expect(mockNavigate).toHaveBeenCalledWith("/session/list");
  });
});
