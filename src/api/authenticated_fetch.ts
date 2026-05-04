import { gzipCompress } from "./gzip_compress";

const GZIP_COMPRESSED_ENDPOINTS = ["/v1/hands"] as const;

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function shouldGzipCompress(url: string, method: string | undefined): boolean {
  if (method !== "POST") return false;
  try {
    const { pathname } = new URL(url);
    return GZIP_COMPRESSED_ENDPOINTS.some((endpoint) => pathname === endpoint);
  } catch {
    return false;
  }
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  getAccessToken?: () => Promise<string | null>,
): Promise<Response> {
  const token = getAccessToken ? await getAccessToken() : null;
  if (!token) {
    throw new Error("Access token is not available");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  if (
    typeof init?.body === "string" &&
    shouldGzipCompress(resolveUrl(input), init.method)
  ) {
    let compressed: Uint8Array<ArrayBuffer>;
    try {
      compressed = gzipCompress(init.body) as Uint8Array<ArrayBuffer>;
    } catch (cause) {
      throw new Error(
        `リクエストボディの圧縮に失敗しました: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
    headers.set("Content-Encoding", "gzip");
    const compressedData: BodyInit = new Blob([compressed], {
      type: "application/octet-stream",
    });
    return fetch(input, { ...init, headers, body: compressedData });
  }

  return fetch(input, { ...init, headers });
}
