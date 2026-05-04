import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as backendModule from "../../../api/backend";
import { SessionList } from "./index";

// backend モジュールをまとめてモック
vi.mock("../../../api/backend", () => ({
  listGameEventsPaginated: vi.fn(),
  finishGameEvent: vi.fn(),
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

const MOCK_ONGOING_SESSION = {
  gameEventId: "event00000000001",
  venueId: "e2e00000000000b0",
  gameTableId: "table0000000001",
  gameRule: "texas_holdem" as const,
  gameFormat: "ring_game" as const,
  status: "started" as const,
  gameName: "テストゲーム1",
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

const MOCK_FINISHED_SESSION = {
  ...MOCK_ONGOING_SESSION,
  gameEventId: "event00000000002",
  gameName: "テストゲーム2",
  status: "finished" as const,
  finishedAt: "2024-01-01T05:00:00Z",
};

const MOCK_LIST_RESPONSE = {
  data: [MOCK_ONGOING_SESSION, MOCK_FINISHED_SESSION],
  total: 2,
  page: 1,
  perPage: 20,
};

function renderSessionList() {
  return render(
    <MemoryRouter>
      <SessionList />
    </MemoryRouter>,
  );
}

describe("SessionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    vi.mocked(backendModule.listGameEventsPaginated).mockResolvedValue(
      MOCK_LIST_RESPONSE,
    );
    vi.mocked(backendModule.finishGameEvent).mockResolvedValue(
      MOCK_FINISHED_SESSION,
    );
  });

  it("「セッション一覧」見出しが表示される", async () => {
    renderSessionList();
    expect(screen.getByText("セッション一覧")).toBeInTheDocument();
  });

  it("セッションリストが描画される", async () => {
    renderSessionList();
    await waitFor(() => {
      expect(screen.getByText("テストゲーム1")).toBeInTheDocument();
      expect(screen.getByText("テストゲーム2")).toBeInTheDocument();
    });
  });

  it("ONGOING と FINISHED のステータスバッジが表示される", async () => {
    renderSessionList();
    await waitFor(() => {
      expect(screen.getByText("ONGOING")).toBeInTheDocument();
      expect(screen.getByText("FINISHED")).toBeInTheDocument();
    });
  });

  it("ページ番号が表示される", async () => {
    renderSessionList();
    await waitFor(() => {
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });
  });

  it("最初のページでは Prev ボタンが disabled", async () => {
    renderSessionList();
    await waitFor(() => {
      expect(screen.getByText("Prev")).toBeInTheDocument();
    });
    const prevButton = screen.getByText("Prev");
    expect(prevButton.closest("button")).toBeDisabled();
  });

  it("最後のページでは Next ボタンが disabled", async () => {
    renderSessionList();
    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument();
    });
    const nextButton = screen.getByText("Next");
    expect(nextButton.closest("button")).toBeDisabled();
  });

  it("ONGOING セッションの編集ボタンをクリックすると navigate が呼ばれる", async () => {
    const user = userEvent.setup();
    renderSessionList();

    await waitFor(() => {
      expect(screen.getByText("テストゲーム1")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("編集");
    // ONGOING は最初のセッション
    await user.click(editButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith(
      `/session/edit/${MOCK_ONGOING_SESSION.gameEventId}`,
      { state: { session: MOCK_ONGOING_SESSION } },
    );
  });

  it("ONGOING セッションの終了ボタンをクリックすると確認モーダルが表示される", async () => {
    const user = userEvent.setup();
    renderSessionList();

    await waitFor(() => {
      expect(screen.getByText("テストゲーム1")).toBeInTheDocument();
    });

    await user.click(screen.getByText("終了"));

    expect(
      screen.getByText("このセッションを終了しますか？"),
    ).toBeInTheDocument();
  });

  it("確認モーダルで「終了する」を押すと finishGameEvent が呼ばれる", async () => {
    const user = userEvent.setup();
    renderSessionList();

    await waitFor(() => {
      expect(screen.getByText("テストゲーム1")).toBeInTheDocument();
    });

    await user.click(screen.getByText("終了"));

    await waitFor(() => {
      expect(
        screen.getByText("このセッションを終了しますか？"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByText("終了する"));

    await waitFor(() => {
      expect(backendModule.finishGameEvent).toHaveBeenCalledWith(
        MOCK_ONGOING_SESSION.gameEventId,
      );
    });
  });

  it("「戻る」ボタンをクリックすると navigate('/') が呼ばれる", async () => {
    const user = userEvent.setup();
    renderSessionList();

    await user.click(screen.getByText("戻る"));

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
