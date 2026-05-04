import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedFetch } from "./authenticated_fetch";
import { gzipCompress } from "./gzip_compress";

vi.mock("./gzip_compress", () => ({
  gzipCompress: vi.fn(),
}));

const mockGetAccessToken = vi.fn();
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("authenticatedFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  describe("認証トークン", () => {
    it("Authorization ヘッダーにトークンを付与すること", async () => {
      mockGetAccessToken.mockResolvedValue("test-token");

      await authenticatedFetch(
        "https://api.example.com/v1/test",
        { method: "GET" },
        mockGetAccessToken,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      const [, init] = mockFetch.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-token");
    });

    it("アクセストークンが null の場合はエラーをスローすること", async () => {
      mockGetAccessToken.mockResolvedValue(null);

      let caughtError: unknown;
      try {
        await authenticatedFetch(
          "https://api.example.com/v1/test",
          { method: "GET" },
          mockGetAccessToken,
        );
      } catch (e) {
        caughtError = e;
      }
      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toContain(
        "Access token is not available",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("getAccessToken が未指定の場合はエラーをスローすること", async () => {
      let caughtError: unknown;
      try {
        await authenticatedFetch("https://api.example.com/v1/test", {
          method: "GET",
        });
      } catch (e) {
        caughtError = e;
      }
      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toContain(
        "Access token is not available",
      );
    });
  });

  describe("POST リクエストの gzip 圧縮", () => {
    it("string body の POST リクエストに Content-Encoding: gzip を付与すること", async () => {
      mockGetAccessToken.mockResolvedValue("test-token");
      const compressedData = new Uint8Array([
        0x1f, 0x8b, 0x08,
      ]) as Uint8Array<ArrayBuffer>;
      vi.mocked(gzipCompress).mockReturnValue(compressedData);

      await authenticatedFetch(
        "https://api.example.com/v1/hands",
        {
          method: "POST",
          body: '{"handId":"test"}',
          headers: { "Content-Type": "application/json" },
        },
        mockGetAccessToken,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      const [, init] = mockFetch.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect.soft(headers.get("Content-Encoding")).toBe("gzip");
      expect.soft(headers.get("Authorization")).toBe("Bearer test-token");
      expect.soft(init?.body).toBeInstanceOf(Blob);
    });

    it("string body の POST リクエストで gzipCompress を呼び出すこと", async () => {
      mockGetAccessToken.mockResolvedValue("test-token");
      vi.mocked(gzipCompress).mockReturnValue(
        new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>,
      );

      const bodyText = '{"handId":"abc123"}';
      await authenticatedFetch(
        "https://api.example.com/v1/hands",
        { method: "POST", body: bodyText },
        mockGetAccessToken,
      );

      expect(vi.mocked(gzipCompress)).toHaveBeenCalledWith(bodyText);
    });

    it("GET リクエストでは gzip 圧縮しないこと", async () => {
      mockGetAccessToken.mockResolvedValue("test-token");

      await authenticatedFetch(
        "https://api.example.com/v1/hands",
        { method: "GET" },
        mockGetAccessToken,
      );

      expect(vi.mocked(gzipCompress)).not.toHaveBeenCalled();
      const [, init] = mockFetch.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(headers.get("Content-Encoding")).toBeNull();
    });

    it("body が string でない POST リクエストでは gzip 圧縮しないこと", async () => {
      mockGetAccessToken.mockResolvedValue("test-token");

      await authenticatedFetch(
        "https://api.example.com/v1/hands",
        { method: "POST", body: new Uint8Array([1, 2, 3]) },
        mockGetAccessToken,
      );

      expect(vi.mocked(gzipCompress)).not.toHaveBeenCalled();
      const [, init] = mockFetch.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(headers.get("Content-Encoding")).toBeNull();
    });

    it("body がない POST リクエストでは gzip 圧縮しないこと", async () => {
      mockGetAccessToken.mockResolvedValue("test-token");

      await authenticatedFetch(
        "https://api.example.com/v1/hands",
        { method: "POST" },
        mockGetAccessToken,
      );

      expect(vi.mocked(gzipCompress)).not.toHaveBeenCalled();
      const [, init] = mockFetch.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(headers.get("Content-Encoding")).toBeNull();
    });

    it("gzipCompress がエラーをスローした場合、説明的なエラーメッセージで再スローすること", async () => {
      mockGetAccessToken.mockResolvedValue("test-token");
      vi.mocked(gzipCompress).mockImplementation(() => {
        throw new Error("compression failed");
      });

      let caughtError: unknown;
      try {
        await authenticatedFetch(
          "https://api.example.com/v1/hands",
          { method: "POST", body: '{"handId":"test"}' },
          mockGetAccessToken,
        );
      } catch (e) {
        caughtError = e;
      }
      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toContain(
        "リクエストボディの圧縮に失敗しました: compression failed",
      );
    });

    it("input が Request オブジェクトの場合でも URL を正しく解決すること", async () => {
      mockGetAccessToken.mockResolvedValue("test-token");
      const compressedData = new Uint8Array([
        0x1f, 0x8b, 0x08,
      ]) as Uint8Array<ArrayBuffer>;
      vi.mocked(gzipCompress).mockReturnValue(compressedData);

      const request = new Request("https://api.example.com/v1/hands", {
        method: "POST",
        body: '{"handId":"test"}',
      });

      await authenticatedFetch(
        request,
        { method: "POST", body: '{"handId":"test"}' },
        mockGetAccessToken,
      );

      expect(vi.mocked(gzipCompress)).toHaveBeenCalled();
      const [, init] = mockFetch.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(headers.get("Content-Encoding")).toBe("gzip");
    });

    it("/v1/hands 以外のエンドポイントへの POST リクエストでは gzip 圧縮しないこと", async () => {
      mockGetAccessToken.mockResolvedValue("test-token");

      await authenticatedFetch(
        "https://api.example.com/v1/other",
        {
          method: "POST",
          body: '{"key":"value"}',
          headers: { "Content-Type": "application/json" },
        },
        mockGetAccessToken,
      );

      expect(vi.mocked(gzipCompress)).not.toHaveBeenCalled();
      const [, init] = mockFetch.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect.soft(headers.get("Content-Encoding")).toBeNull();
      expect.soft(headers.get("Authorization")).toBe("Bearer test-token");
      expect.soft(init?.body).toBe('{"key":"value"}');
    });
  });
});
