import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInit = vi.fn();
const mockBrowserTracingIntegration = vi.fn();
const mockReplayIntegration = vi.fn();

vi.mock("@sentry/react", () => ({
  init: mockInit,
  browserTracingIntegration: mockBrowserTracingIntegration,
  replayIntegration: mockReplayIntegration,
  ErrorBoundary: vi.fn(),
}));

describe("initializeSentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("VITE_SENTRY_DSN が設定されている場合、Sentry.init が呼ばれる", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://test@sentry.io/123");
    const { initializeSentry } = await import("./sentry");
    initializeSentry();
    expect(mockInit).toHaveBeenCalledOnce();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: "https://test@sentry.io/123" }),
    );
  });

  it("VITE_SENTRY_DSN が未設定の場合、Sentry.init が呼ばれない", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    const { initializeSentry } = await import("./sentry");
    initializeSentry();
    expect(mockInit).not.toHaveBeenCalled();
  });
});
