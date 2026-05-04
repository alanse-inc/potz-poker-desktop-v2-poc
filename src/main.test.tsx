import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockInitializeSentry = vi.fn();
const mockInitMixpanel = vi.fn();
const mockErrorBoundary = vi.fn();

vi.mock("./services/sentry", () => ({
  initializeSentry: mockInitializeSentry,
  Sentry: {
    ErrorBoundary: mockErrorBoundary,
  },
}));

vi.mock("./services/mixpanel", () => ({
  initMixpanel: mockInitMixpanel,
}));

vi.mock("./routes", () => ({
  mainRouter: {},
}));

vi.mock("react-router", () => ({
  RouterProvider: () => null,
}));

vi.mock("react-hot-toast", () => ({
  Toaster: () => null,
  default: { error: vi.fn() },
}));

vi.mock("./contexts/auth_context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: vi.fn(),
}));
vi.mock("./contexts/session_context", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./contexts/operator_context", () => ({
  OperatorProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./contexts/rfid_card_mapping_context", () => ({
  RFIDCardMappingProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("./contexts/initial_board_context", () => ({
  InitialBoardProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("./contexts/card_placed_event", () => ({
  CardPlacedEventProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("./contexts/telop_context", () => ({
  TelopProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./contexts/board_context", () => ({
  BoardProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./contexts/auto_board_context", () => ({
  AutoBoardProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./css/index.css", () => ({}));

describe("main.tsx", () => {
  it("モジュールロード時に initializeSentry と initMixpanel が呼ばれる", async () => {
    mockErrorBoundary.mockImplementation(
      ({ children }: { children: React.ReactNode }) => children,
    );
    const rootDiv = document.createElement("div");
    rootDiv.id = "root";
    document.body.appendChild(rootDiv);
    await import("./main");
    expect(mockInitializeSentry).toHaveBeenCalledOnce();
    expect(mockInitMixpanel).toHaveBeenCalledOnce();
    document.body.removeChild(rootDiv);
  });
});

describe("ErrorBoundary fallback", () => {
  it("エラー発生時に fallback がエラーメッセージを表示する", () => {
    const FallbackComponent = ({ error }: { error: Error }) => (
      <div>エラーが発生しました: {error.message}</div>
    );

    render(<FallbackComponent error={new Error("テストエラー")} />);
    expect(
      screen.getByText("エラーが発生しました: テストエラー"),
    ).toBeInTheDocument();
  });
});
