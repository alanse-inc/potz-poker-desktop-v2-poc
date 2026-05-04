import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BackendApiError,
  checkinPlayer,
  checkoutPlayer,
  finishGameEvent,
  getGameEventDetail,
  getHealth,
  getMe,
  getPlayer,
  listGameEvents,
  listGameEventsPaginated,
  updateGameEvent,
} from "./backend";

// fetch をグローバルでモック
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("backend API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getHealth", () => {
    it("GET /health を呼ぶ", async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ status: "ok" }));
      await getHealth();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/health"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer dummy",
          }),
        }),
      );
    });
  });

  describe("listGameEvents", () => {
    it("正しい URL でクエリパラメータを渡す", async () => {
      mockFetch.mockResolvedValue(makeOkResponse([]));
      await listGameEvents({ venueId: "abc123", statuses: "started,pending" });
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/v1/game-events");
      expect(url).toContain("venueId=abc123");
      expect(url).toContain("statuses=started%2Cpending");
    });

    it("レスポンスを返す", async () => {
      const events = [{ gameEventId: "event001", status: "started" }];
      mockFetch.mockResolvedValue(makeOkResponse(events));
      const result = await listGameEvents({
        venueId: "abc",
        statuses: "started",
      });
      expect(result).toEqual(events);
    });
  });

  describe("getGameEventDetail", () => {
    it("GET /v1/game-events/{id} を呼ぶ", async () => {
      const detail = { gameEventId: "event001", sessions: [] };
      mockFetch.mockResolvedValue(makeOkResponse(detail));
      await getGameEventDetail("event001");
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain("/v1/game-events/event001");
    });
  });

  describe("getPlayer", () => {
    it("GET /v1/players/{id} を呼ぶ", async () => {
      const player = {
        playerId: "1234567890abcdef",
        nickName: "Alice",
        avatarUrlSmall: null,
        avatarUrlLarge: null,
      };
      mockFetch.mockResolvedValue(makeOkResponse(player));
      const result = await getPlayer("1234567890abcdef");
      expect(result).toEqual(player);
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain("/v1/players/1234567890abcdef");
    });
  });

  describe("checkinPlayer", () => {
    it("POST /v1/game-events/{eid}/sessions/{sid}/checkin を body 付きで呼ぶ", async () => {
      const response = {
        gameSessionId: "sess001",
        playerId: "1234567890abcdef",
        nickName: "Alice",
        avatarPath: null,
        startHandNumber: 1,
        finishedHandNumber: null,
        checkedInAt: "2024-01-01T00:00:00Z",
        checkedOutAt: null,
      };
      mockFetch.mockResolvedValue(makeOkResponse(response));
      await checkinPlayer({
        gameEventId: "event001",
        gameSessionId: "sess001",
        playerId: "1234567890abcdef",
      });
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(
        "/v1/game-events/event001/sessions/sess001/checkin",
      );
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual({
        playerId: "1234567890abcdef",
      });
    });
  });

  describe("checkoutPlayer", () => {
    it("POST /v1/game-events/{eid}/sessions/{sid}/checkout を body 付きで呼ぶ", async () => {
      const response = {
        gameSessionId: "sess001",
        playerId: "1234567890abcdef",
        nickName: "Alice",
        avatarPath: null,
        startHandNumber: 1,
        finishedHandNumber: 1,
        checkedInAt: "2024-01-01T00:00:00Z",
        checkedOutAt: "2024-01-01T01:00:00Z",
      };
      mockFetch.mockResolvedValue(makeOkResponse(response));
      await checkoutPlayer({
        gameEventId: "event001",
        gameSessionId: "sess001",
        playerId: "1234567890abcdef",
      });
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(
        "/v1/game-events/event001/sessions/sess001/checkout",
      );
      expect(options.method).toBe("POST");
    });
  });

  describe("listGameEventsPaginated", () => {
    it("正しい URL を呼ぶ (page, perPage)", async () => {
      mockFetch.mockResolvedValue(
        makeOkResponse({ data: [], total: 0, page: 1, perPage: 20 }),
      );
      await listGameEventsPaginated(1, 20);
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain("/v1/game_events");
      expect(url).toContain("page=1");
      expect(url).toContain("perPage=20");
    });

    it("status フィルタを URL に含める", async () => {
      mockFetch.mockResolvedValue(
        makeOkResponse({ data: [], total: 0, page: 1, perPage: 20 }),
      );
      await listGameEventsPaginated(1, 20, "ONGOING");
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain("status=ONGOING");
    });
  });

  describe("updateGameEvent", () => {
    it("PUT /v1/game_events/:id を body 付きで呼ぶ", async () => {
      const updated = {
        gameEventId: "event001",
        venueId: "venue001",
        gameTableId: "table001",
        gameRule: "texas_holdem" as const,
        gameFormat: "ring_game" as const,
        status: "started" as const,
        gameName: "Updated Name",
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
      mockFetch.mockResolvedValue(makeOkResponse(updated));
      await updateGameEvent("event001", { name: "Updated Name" });
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/v1/game_events/event001");
      expect(options.method).toBe("PUT");
      expect(JSON.parse(options.body as string)).toEqual({
        name: "Updated Name",
      });
    });
  });

  describe("finishGameEvent", () => {
    it("POST /v1/game_events/:id/finish を呼ぶ", async () => {
      const finished = {
        gameEventId: "event001",
        venueId: "venue001",
        gameTableId: "table001",
        gameRule: "texas_holdem" as const,
        gameFormat: "ring_game" as const,
        status: "finished" as const,
        gameName: "Finished Event",
        defaultStack: null,
        miniChip: 100,
        smallBlind: 100,
        bigBlind: 200,
        anteRule: "none" as const,
        blindExceptionRule: "dead_button" as const,
        startDate: "2024-01-01",
        startedAt: "2024-01-01T00:00:00Z",
        finishedAt: "2024-01-01T05:00:00Z",
        startedTableId: null,
      };
      mockFetch.mockResolvedValue(makeOkResponse(finished));
      await finishGameEvent("event001");
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/v1/game_events/event001/finish");
      expect(options.method).toBe("POST");
    });
  });

  describe("getMe", () => {
    it("GET /v1/players/me を呼ぶ", async () => {
      const me = {
        playerId: "player001",
        nickName: "TestUser",
        email: "test@example.com",
        role: "admin",
        avatarUrlSmall: null,
        avatarUrlLarge: null,
      };
      mockFetch.mockResolvedValue(makeOkResponse(me));
      const result = await getMe();
      expect(result).toEqual(me);
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain("/v1/players/me");
    });

    it("401 エラー時は BackendApiError を throw する", async () => {
      mockFetch.mockResolvedValue(
        makeErrorResponse(401, { detail: "Unauthorized" }),
      );
      await expect(getMe()).rejects.toThrow(BackendApiError);
      try {
        await getMe();
      } catch (err) {
        expect(err).toBeInstanceOf(BackendApiError);
        expect((err as BackendApiError).status).toBe(401);
      }
    });
  });

  describe("エラーハンドリング", () => {
    it("非 2xx レスポンスは BackendApiError を throw する", async () => {
      mockFetch.mockResolvedValue(
        makeErrorResponse(404, {
          type: "not_found",
          status: 404,
          title: "Not Found",
          detail: "Player not found",
          errors: [],
        }),
      );
      await expect(getPlayer("notexists")).rejects.toThrow(BackendApiError);
    });

    it("BackendApiError は status と detail を保持する", async () => {
      mockFetch.mockResolvedValue(
        makeErrorResponse(422, {
          detail: "Already checked in",
          status: 422,
        }),
      );
      try {
        await checkinPlayer({
          gameEventId: "eid",
          gameSessionId: "sid",
          playerId: "1234567890abcdef",
        });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(BackendApiError);
        expect((err as BackendApiError).status).toBe(422);
        expect((err as BackendApiError).detail).toBe("Already checked in");
      }
    });

    it("JSON パース不能なエラーレスポンスでも BackendApiError を throw する", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.reject(new Error("not json")),
      } as unknown as Response);
      await expect(getHealth()).rejects.toThrow(BackendApiError);
    });
  });
});
