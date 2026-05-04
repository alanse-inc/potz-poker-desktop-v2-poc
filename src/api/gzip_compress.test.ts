import { ungzip } from "pako";
import { describe, expect, it } from "vitest";
import { gzipCompress } from "./gzip_compress";

describe("gzipCompress", () => {
  it("文字列を Uint8Array に変換すること", () => {
    const result = gzipCompress("hello");
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("空文字列を処理できること", () => {
    const result = gzipCompress("");
    expect(result).toBeInstanceOf(Uint8Array);
    expect.soft(result.length).toBeGreaterThan(0);
  });

  it("圧縮したデータを解凍すると元の文字列に戻ること", () => {
    const input = "test data";
    const result = gzipCompress(input);
    const decoded = new TextDecoder().decode(ungzip(result));
    expect(decoded).toBe(input);
  });

  it("長い文字列を処理できること", () => {
    const input = "a".repeat(10000);
    const result = gzipCompress(input);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("マルチバイト文字を処理できること", () => {
    const input = "日本語テスト";
    const result = gzipCompress(input);
    const decoded = new TextDecoder().decode(ungzip(result));
    expect(decoded).toBe(input);
  });
});
