import { describe, expect, it, vi } from "vitest";

vi.mock("./fetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "./fetch";
import { fetchHandContext } from "./hand_context_api";
import type { HandContext } from "./mappers/board_to_hand_request";

describe("fetchHandContext", () => {
  it("手役コンテキストを API から取得して返すこと", async () => {
    const mockHandContext: HandContext = {
      initialBoard: { players: [{ id: "player1", stack: 1000 }] },
      gameStartedAt: "2024-01-01T12:00:00Z",
      actionHistory: [],
      sidePots: [],
    };

    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ value: mockHandContext }), { status: 200 }),
    );

    const result = await fetchHandContext();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(mockHandContext);
    }
    expect(apiFetch).toHaveBeenCalledWith("/api/hand-context");
  });

  it("レスポンスが ok でない場合はエラーを返すこと", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 500 }));

    const result = await fetchHandContext();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "fetchHandContext failed: HTTP 500",
      );
    }
  });

  it("data.value が存在しない場合はエラーを返すこと", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const result = await fetchHandContext();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("data.value is missing");
    }
  });

  it("ネットワークエラーの場合はエラーを返すこと", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Network failed"));

    const result = await fetchHandContext();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Network failed");
    }
  });
});
