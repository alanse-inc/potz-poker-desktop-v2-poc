import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveGameEvent } from "./backend_game_event";

vi.mock("./fetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "./fetch";

function makeOkResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve({ gameEventId: "event001" }),
  } as unknown as Response;
}

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
  } as unknown as Response;
}

describe("setActiveGameEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("成功時に ok(undefined) を返す", async () => {
    vi.mocked(apiFetch).mockResolvedValue(makeOkResponse());

    const result = await setActiveGameEvent("event001");

    expect(result.isOk()).toBe(true);
  });

  it("POST /api/game-event/set-active を gameEventId 付きで呼ぶ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(makeOkResponse());

    await setActiveGameEvent("event001");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/game-event/set-active",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ gameEventId: "event001" }),
      }),
    );
  });

  it("サーバーが非 2xx を返した場合は err({ kind: 'server_error' }) を返す", async () => {
    vi.mocked(apiFetch).mockResolvedValue(makeErrorResponse(503));

    const result = await setActiveGameEvent("event001");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe("server_error");
      expect(
        (
          result.error as {
            kind: "server_error";
            status: number;
            message: string;
          }
        ).status,
      ).toBe(503);
    }
  });

  it("apiFetch が throw した場合は err({ kind: 'network_error' }) を返す", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("connection refused"));

    const result = await setActiveGameEvent("event001");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe("network_error");
      expect(result.error.message).toBe("connection refused");
    }
  });
});
