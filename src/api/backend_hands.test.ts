import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./authenticated_fetch", () => ({
  authenticatedFetch: vi.fn(),
}));

vi.mock("../features/error_tracker", () => ({
  trackClientSideError: vi.fn(),
}));

import { authenticatedFetch } from "./authenticated_fetch";
import type { CreateHandRequest } from "./backend_hands";
import { createHand } from "./backend_hands";

const mockGetAccessToken = vi.fn().mockResolvedValue("test-token");

const minimalRequest: CreateHandRequest = {
  handId: "abc1234567890123",
  sessionId: "session-1",
  gameEventId: "event-1",
  handNumber: 1,
  tableId: "table-1",
  gameRule: "texas_holdem",
  gameFormat: "ring_game",
  buttonPosition: 0,
  smallBlind: 100,
  bigBlind: 200,
  ante: 0,
  bbAnte: false,
  totalPot: 400,
  playerCount: 2,
  flopCards: null,
  turnCard: null,
  riverCard: null,
  startTime: "2024-01-01T12:00:00Z",
  endTime: "2024-01-01T12:30:00Z",
  players: [],
  actions: [],
  sidePots: [],
};

describe("createHand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功レスポンスを BackendApiResult に変換すること", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({ handId: "abc1234567890123", status: "accepted" }),
        { status: 200 },
      ),
    );

    const result = await createHand(minimalRequest, mockGetAccessToken);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.handId).toBe("abc1234567890123");
      expect(result.data.status).toBe("accepted");
    }
  });

  it("HTTP エラーを BackendApiResult エラーに変換すること", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ detail: "Bad Request" }), { status: 400 }),
    );

    const result = await createHand(minimalRequest, mockGetAccessToken);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toBe("Bad Request");
    }
  });

  it("ネットワークエラーを BackendApiResult エラーに変換すること", async () => {
    vi.mocked(authenticatedFetch).mockRejectedValue(new Error("Network error"));

    const result = await createHand(minimalRequest, mockGetAccessToken);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.message).toContain("Network error");
    }
  });

  it("authenticatedFetch を正しい URL と POST メソッドで呼び出すこと", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({ handId: "abc1234567890123", status: "accepted" }),
        { status: 200 },
      ),
    );

    await createHand(minimalRequest, mockGetAccessToken);

    expect(authenticatedFetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(authenticatedFetch).mock.calls[0];
    expect(String(url)).toContain("/v1/hands");
    expect(init?.method).toBe("POST");
  });

  it("HTTP 詳細エラーが body に含まれない場合のフォールバックメッセージ", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(null, { status: 500, statusText: "Internal Server Error" }),
    );

    const result = await createHand(minimalRequest, mockGetAccessToken);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.message).toContain("HTTP 500");
    }
  });
});
