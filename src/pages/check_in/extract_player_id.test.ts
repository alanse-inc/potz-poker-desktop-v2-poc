import { describe, expect, test } from "vitest";
import { extractPlayerId, extractPlayerIdOrThrow } from "./extract_player_id";

describe("extractPlayerId (null-returning variant)", () => {
  test("有効な URL から playerId を返す", () => {
    expect(extractPlayerId("https://potz.poker/checkin/1234567890abcdef")).toBe(
      "1234567890abcdef",
    );
  });

  test("無効な入力に対して null を返す", () => {
    expect(extractPlayerId("not a url")).toBeNull();
  });
});

describe("extractPlayerIdOrThrow", () => {
  describe("正常系", () => {
    test("有効なQRコードURLから正しくplayerIdを抽出する", () => {
      const validUrl = "https://potz.poker/checkin/1234567890abcdef";
      const result = extractPlayerIdOrThrow(validUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("hexId16の境界値: all 0", () => {
      const url = "https://potz.poker/checkin/0000000000000000";
      const result = extractPlayerIdOrThrow(url);
      expect(result).toBe("0000000000000000");
    });

    test("hexId16の境界値: all f", () => {
      const url = "https://potz.poker/checkin/ffffffffffffffff";
      const result = extractPlayerIdOrThrow(url);
      expect(result).toBe("ffffffffffffffff");
    });

    test("hexId16の境界値: 0-f混在", () => {
      const url = "https://potz.poker/checkin/0123456789abcdef";
      const result = extractPlayerIdOrThrow(url);
      expect(result).toBe("0123456789abcdef");
    });

    test("URLエンコードされたplayerIdをデコード", () => {
      const url = "https://potz.poker/checkin/1234567890abcdef";
      const result = extractPlayerIdOrThrow(url);
      expect(result).toBe("1234567890abcdef");
    });

    test("Caps Lock ON状態の全大文字URLを許可（Windows環境）", () => {
      const uppercaseUrl = "HTTPS://POTZ.POKER/CHECKIN/1234567890ABCDEF";
      const result = extractPlayerIdOrThrow(uppercaseUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("全大文字URL（QRコードAlphanumericモード）を許可", () => {
      const alphanumericUrl = "HTTPS://POTZ.POKER/CHECKIN/FEDCBA0987654321";
      const result = extractPlayerIdOrThrow(alphanumericUrl);
      expect(result).toBe("fedcba0987654321");
    });

    test("パスが大文字の混在URL", () => {
      const mixedCaseUrl = "https://potz.poker/CHECKIN/1234567890abcdef";
      const result = extractPlayerIdOrThrow(mixedCaseUrl);
      expect(result).toBe("1234567890abcdef");
    });
  });

  describe("ホスト名エラー", () => {
    test("無効なドメインでエラー", () => {
      const invalidUrl = "https://example.com/checkin/1234567890abcdef";
      expect(() => extractPlayerIdOrThrow(invalidUrl)).toThrow(
        "無効なドメインです（期待値: potz.poker）",
      );
    });

    test("似たドメイン（potz.com）でエラー", () => {
      const similarUrl = "https://potz.com/checkin/1234567890abcdef";
      expect(() => extractPlayerIdOrThrow(similarUrl)).toThrow(
        "無効なドメインです（期待値: potz.poker）",
      );
    });

    test("サブドメインが含まれる場合エラー", () => {
      const subdomainUrl = "https://www.potz.poker/checkin/1234567890abcdef";
      expect(() => extractPlayerIdOrThrow(subdomainUrl)).toThrow(
        "無効なドメインです（期待値: potz.poker）",
      );
    });
  });

  describe("パス構造エラー", () => {
    test("/checkin のみ（IDなし）でエラー", () => {
      const noIdUrl = "https://potz.poker/checkin";
      expect(() => extractPlayerIdOrThrow(noIdUrl)).toThrow(
        "QRコードフォーマットが無効です",
      );
    });

    test("余分なパスセグメントでエラー", () => {
      const extraPathUrl = "https://potz.poker/checkin/1234567890abcdef/extra";
      expect(() => extractPlayerIdOrThrow(extraPathUrl)).toThrow(
        "QRコードフォーマットが無効です",
      );
    });

    test("異なるエンドポイント名でエラー", () => {
      const wrongEndpointUrl = "https://potz.poker/register/1234567890abcdef";
      expect(() => extractPlayerIdOrThrow(wrongEndpointUrl)).toThrow(
        "QRコードフォーマットが無効です",
      );
    });

    test("ルートパスのみでエラー", () => {
      const rootUrl = "https://potz.poker/";
      expect(() => extractPlayerIdOrThrow(rootUrl)).toThrow(
        "QRコードフォーマットが無効です",
      );
    });

    test("/checkin/ で終わる（空のID）でエラー", () => {
      const emptyIdUrl = "https://potz.poker/checkin/";
      expect(() => extractPlayerIdOrThrow(emptyIdUrl)).toThrow(
        "QRコードフォーマットが無効です",
      );
    });
  });

  describe("playerIDバリデーションエラー", () => {
    test("15桁（短い）でエラー", () => {
      const shortIdUrl = "https://potz.poker/checkin/123456789abcdef";
      expect(() => extractPlayerIdOrThrow(shortIdUrl)).toThrow(
        "無効なプレイヤーID形式です。正しいQRコードをスキャンしてください。",
      );
    });

    test("17桁（長い）でエラー", () => {
      const longIdUrl = "https://potz.poker/checkin/1234567890abcdef0";
      expect(() => extractPlayerIdOrThrow(longIdUrl)).toThrow(
        "無効なプレイヤーID形式です。正しいQRコードをスキャンしてください。",
      );
    });

    test("16進数外の文字（g）を含む場合エラー", () => {
      const invalidCharUrl = "https://potz.poker/checkin/1234567890abcdeg";
      expect(() => extractPlayerIdOrThrow(invalidCharUrl)).toThrow(
        "無効なプレイヤーID形式です。正しいQRコードをスキャンしてください。",
      );
    });

    test("記号（-）を含む場合エラー", () => {
      const symbolUrl = "https://potz.poker/checkin/1234567890abcde-";
      expect(() => extractPlayerIdOrThrow(symbolUrl)).toThrow(
        "無効なプレイヤーID形式です。正しいQRコードをスキャンしてください。",
      );
    });

    test("スペースを含む場合エラー", () => {
      const spaceUrl = "https://potz.poker/checkin/1234567890abcde%20";
      expect(() => extractPlayerIdOrThrow(spaceUrl)).toThrow(
        "無効なプレイヤーID形式です。正しいQRコードをスキャンしてください。",
      );
    });
  });

  describe("直接ID形式（USB QRリーダーフォールバック）", () => {
    test("hexId16形式の直接IDからplayerIdを抽出する", () => {
      const result = extractPlayerIdOrThrow("1234567890abcdef");
      expect(result).toBe("1234567890abcdef");
    });

    test("all-0のhexId16直接ID", () => {
      const result = extractPlayerIdOrThrow("0000000000000000");
      expect(result).toBe("0000000000000000");
    });

    test("all-fのhexId16直接ID", () => {
      const result = extractPlayerIdOrThrow("ffffffffffffffff");
      expect(result).toBe("ffffffffffffffff");
    });

    test("直接ID大文字（Caps Lock ON時）を許可", () => {
      const result = extractPlayerIdOrThrow("1234567890ABCDEF");
      expect(result).toBe("1234567890abcdef");
    });

    test("直接ID全大文字を許可", () => {
      const result = extractPlayerIdOrThrow("FEDCBA0987654321");
      expect(result).toBe("fedcba0987654321");
    });

    test("直接IDは15桁の場合エラー", () => {
      expect(() => extractPlayerIdOrThrow("123456789abcdef")).toThrow();
    });

    test("直接IDは17桁の場合エラー", () => {
      expect(() => extractPlayerIdOrThrow("1234567890abcdef0")).toThrow();
    });
  });

  describe("URL形式エラー", () => {
    test("URLでない文字列でエラー", () => {
      const notUrl = "not a url";
      expect(() => extractPlayerIdOrThrow(notUrl)).toThrow("Invalid URL");
    });

    test("プロトコルなし（potz.poker始まり）を許可", () => {
      const noProtocol = "potz.poker/checkin/1234567890abcdef";
      const result = extractPlayerIdOrThrow(noProtocol);
      expect(result).toBe("1234567890abcdef");
    });

    test("httpプロトコル（httpsでない）は許可", () => {
      const httpUrl = "http://potz.poker/checkin/1234567890abcdef";
      const result = extractPlayerIdOrThrow(httpUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("Windows由来のバックスラッシュ区切りを許可", () => {
      const backslashUrl = "https:\\potz.poker\\checkin\\1234567890abcdef";
      const result = extractPlayerIdOrThrow(backslashUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("スキームのスラッシュ欠落（https:/）を許可", () => {
      const brokenSchemeUrl = "https:/potz.poker/checkin/1234567890abcdef";
      const result = extractPlayerIdOrThrow(brokenSchemeUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("スキームのスラッシュ欠落（http:/）を許可", () => {
      const brokenHttpUrl = "http:/potz.poker/checkin/1234567890abcdef";
      const result = extractPlayerIdOrThrow(brokenHttpUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("スキームのスラッシュ過多（https:///）を許可（Windows バックスラッシュ3連変換）", () => {
      const tripleSlashUrl = "https:///potz.poker/checkin/1234567890abcdef";
      const result = extractPlayerIdOrThrow(tripleSlashUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("プロトコル相対URL（//potz.poker/...）を許可（Windowsでhttps:が欠落した場合）", () => {
      const protocolRelativeUrl = "//potz.poker/checkin/1234567890abcdef";
      const result = extractPlayerIdOrThrow(protocolRelativeUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("全角記号を含むURLを許可", () => {
      const fullWidthUrl = "https：／／potz.poker／checkin／1234567890abcdef";
      const result = extractPlayerIdOrThrow(fullWidthUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("URLにスペースが混入した場合でも許可（Windows USB QRリーダーの誤挿入）", () => {
      const spaceInUrl = "https://potz.poker /checkin/1234567890abcdef";
      const result = extractPlayerIdOrThrow(spaceInUrl);
      expect(result).toBe("1234567890abcdef");
    });

    test("直接IDにスペースが混入した場合でも許可（Windows USB QRリーダーの誤挿入）", () => {
      const spaceInId = "1234567890 abcdef";
      const result = extractPlayerIdOrThrow(spaceInId);
      expect(result).toBe("1234567890abcdef");
    });

    test("クエリパラメータを含むURLでエラー", () => {
      const urlWithQuery =
        "https://potz.poker/checkin/1234567890abcdef?foo=bar";
      expect(() => extractPlayerIdOrThrow(urlWithQuery)).toThrow(
        "QRコードフォーマットが無効です",
      );
    });

    test("フラグメントを含むURLは許可（無視される）", () => {
      const urlWithFragment =
        "https://potz.poker/checkin/1234567890abcdef#section";
      const result = extractPlayerIdOrThrow(urlWithFragment);
      expect(result).toBe("1234567890abcdef");
    });

    test("非標準ポート番号を含むURLでエラー", () => {
      const urlWithCustomPort =
        "https://potz.poker:8443/checkin/1234567890abcdef";
      expect(() => extractPlayerIdOrThrow(urlWithCustomPort)).toThrow(
        "QRコードフォーマットが無効です",
      );
    });
  });
});
