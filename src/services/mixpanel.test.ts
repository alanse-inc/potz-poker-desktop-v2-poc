import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInit = vi.fn();

vi.mock("mixpanel-browser", () => ({
  default: {
    init: mockInit,
    identify: vi.fn(),
    register: vi.fn(),
    track: vi.fn(),
    reset: vi.fn(),
    people: { set: vi.fn() },
  },
}));

describe("initMixpanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("VITE_MIXPANEL_TOKEN が設定されている場合、mixpanel.init が呼ばれる", async () => {
    vi.stubEnv("VITE_MIXPANEL_TOKEN", "test-token-123");
    const { initMixpanel } = await import("./mixpanel");
    initMixpanel();
    expect(mockInit).toHaveBeenCalledOnce();
    expect(mockInit).toHaveBeenCalledWith(
      "test-token-123",
      expect.objectContaining({ ignore_dnt: true }),
    );
  });

  it("VITE_MIXPANEL_TOKEN が未設定の場合、mixpanel.init が呼ばれない", async () => {
    vi.stubEnv("VITE_MIXPANEL_TOKEN", "");
    const { initMixpanel } = await import("./mixpanel");
    initMixpanel();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("initMixpanel を複数回呼んでも2回目以降は init されない", async () => {
    vi.stubEnv("VITE_MIXPANEL_TOKEN", "test-token-123");
    const { initMixpanel } = await import("./mixpanel");
    initMixpanel();
    initMixpanel();
    expect(mockInit).toHaveBeenCalledOnce();
  });
});
