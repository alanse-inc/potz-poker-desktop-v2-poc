import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../features/error_tracker", () => ({
  trackClientSideError: vi.fn(),
}));

import {
  cleanText,
  containsActionKeyword,
  extractJson,
  isFillerWordOnly,
  isValidAction,
  normalizeAction,
  parseCommandsFromContent,
} from "./voice_input_parser";

describe("extractJson", () => {
  it("プレーンJSON文字列をそのまま返す", () => {
    const input = '{"commands":[]}';
    expect(extractJson(input)).toBe('{"commands":[]}');
  });

  it("```json コードブロックから中身を抽出する", () => {
    const input = '```json\n{"commands":[]}\n```';
    expect(extractJson(input)).toBe('{"commands":[]}');
  });

  it("``` コードブロック（言語指定なし）から中身を抽出する", () => {
    const input = '```\n{"commands":[]}\n```';
    expect(extractJson(input)).toBe('{"commands":[]}');
  });
});

describe("normalizeAction", () => {
  it("hold を fold に変換する", () => {
    expect(normalizeAction("hold")).toBe("fold");
  });

  it("goal を call に変換する", () => {
    expect(normalizeAction("goal")).toBe("call");
  });

  it("おりる を fold に変換する", () => {
    expect(normalizeAction("おりる")).toBe("fold");
  });

  it("おります を fold に変換する", () => {
    expect(normalizeAction("おります")).toBe("fold");
  });

  it("オールド を fold に変換する", () => {
    expect(normalizeAction("オールド")).toBe("fold");
  });

  it("old を fold に変換する", () => {
    expect(normalizeAction("old")).toBe("fold");
  });

  it("正常なアクションはそのまま返す", () => {
    expect(normalizeAction("bet")).toBe("bet");
    expect(normalizeAction("raise")).toBe("raise");
    expect(normalizeAction("call")).toBe("call");
    expect(normalizeAction("fold")).toBe("fold");
    expect(normalizeAction("check")).toBe("check");
    expect(normalizeAction("all-in")).toBe("all-in");
    expect(normalizeAction("expose")).toBe("expose");
  });
});

describe("isValidAction", () => {
  it("全10アクションでtrueを返す", () => {
    expect(isValidAction("bet")).toBe(true);
    expect(isValidAction("raise")).toBe(true);
    expect(isValidAction("call")).toBe(true);
    expect(isValidAction("fold")).toBe(true);
    expect(isValidAction("check")).toBe(true);
    expect(isValidAction("all-in")).toBe(true);
    expect(isValidAction("expose")).toBe(true);
    expect(isValidAction("back")).toBe(true);
    expect(isValidAction("ok")).toBe(true);
    expect(isValidAction("check-around")).toBe(true);
  });

  it("無効なアクションでfalseを返す", () => {
    expect(isValidAction("hold")).toBe(false);
    expect(isValidAction("goal")).toBe(false);
    expect(isValidAction("unknown")).toBe(false);
    expect(isValidAction("")).toBe(false);
  });
});

describe("isFillerWordOnly", () => {
  it("フィラーワードでtrueを返す", () => {
    expect(isFillerWordOnly("えっと")).toBe(true);
    expect(isFillerWordOnly("あの")).toBe(true);
    expect(isFillerWordOnly("うーん")).toBe(true);
    expect(isFillerWordOnly("ん")).toBe(true);
  });

  it("ポーカーアクションでfalseを返す", () => {
    expect(isFillerWordOnly("コール")).toBe(false);
    expect(isFillerWordOnly("ベット")).toBe(false);
    expect(isFillerWordOnly("フォールド")).toBe(false);
  });

  it("空文字列でfalseを返す", () => {
    expect(isFillerWordOnly("")).toBe(false);
  });
});

describe("containsActionKeyword", () => {
  it("基本アクション語でtrueを返す", () => {
    expect.soft(containsActionKeyword("コール")).toBe(true);
    expect.soft(containsActionKeyword("フォールド")).toBe(true);
    expect.soft(containsActionKeyword("ベット")).toBe(true);
    expect.soft(containsActionKeyword("レイズ")).toBe(true);
    expect.soft(containsActionKeyword("チェック")).toBe(true);
    expect.soft(containsActionKeyword("オールイン")).toBe(true);
    expect.soft(containsActionKeyword("エクスポーズ")).toBe(true);
  });

  it("複合発話でtrueを返す", () => {
    expect(containsActionKeyword("3番コール")).toBe(true);
  });

  it("誤認識バリアントでtrueを返す", () => {
    expect.soft(containsActionKeyword("ゴール")).toBe(true);
    expect.soft(containsActionKeyword("ホールド")).toBe(true);
    expect.soft(containsActionKeyword("ボール")).toBe(true);
    expect.soft(containsActionKeyword("ペット")).toBe(true);
    expect.soft(containsActionKeyword("ball")).toBe(true);
    expect.soft(containsActionKeyword("goal")).toBe(true);
    expect.soft(containsActionKeyword("hold")).toBe(true);
    expect.soft(containsActionKeyword("race")).toBe(true);
    expect.soft(containsActionKeyword("coal")).toBe(true);
  });

  it("アクション語を含まない発話でfalseを返す", () => {
    expect(containsActionKeyword("今日はいい天気ですね")).toBe(false);
  });

  it("空文字列でfalseを返す", () => {
    expect(containsActionKeyword("")).toBe(false);
  });

  it("フィラーワードのみでfalseを返す", () => {
    expect(containsActionKeyword("えっと")).toBe(false);
  });

  it("数字のみでfalseを返す", () => {
    expect(containsActionKeyword("500")).toBe(false);
  });
});

describe("cleanText", () => {
  it("句読点を除去する", () => {
    expect(cleanText("コール。")).toBe("コール");
  });

  it("連続空白を正規化する", () => {
    expect(cleanText("ベット  500")).toBe("ベット 500");
  });

  it("前後の空白をtrimする", () => {
    expect(cleanText("  コール  ")).toBe("コール");
  });
});

describe("parseCommandsFromContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常なJSONから1つのコマンドをパースする", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "call",
          amount: null,
          confidence: 0.95,
          seatNumber: null,
          position: null,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "コール");
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("call");
    expect(result[0].amount).toBeNull();
    expect(result[0].confidence).toBe(0.95);
    expect(result[0].rawText).toBe("コール");
  });

  it("複数コマンドをパースする", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "call",
          amount: null,
          confidence: 0.9,
          seatNumber: null,
          position: null,
        },
        {
          action: "fold",
          amount: null,
          confidence: 0.9,
          seatNumber: null,
          position: null,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "コール フォールド");
    expect(result).toHaveLength(2);
    expect(result[0].action).toBe("call");
    expect(result[1].action).toBe("fold");
  });

  it("不正なJSONで空配列を返す", () => {
    const result = parseCommandsFromContent("not valid json", "テスト");
    expect(result).toHaveLength(0);
  });

  it("配列形式のレスポンスをパースする", () => {
    const content = JSON.stringify([
      {
        action: "bet",
        amount: 500,
        confidence: 0.95,
        seatNumber: null,
        position: null,
      },
    ]);
    const result = parseCommandsFromContent(content, "ベット500");
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("bet");
    expect(result[0].amount).toBe(500);
  });

  it("hold アクションを fold に正規化する", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "hold",
          amount: null,
          confidence: 0.9,
          seatNumber: null,
          position: null,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "ホールド");
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("fold");
  });

  it("confidenceが数値でない場合デフォルト0.8を使用する", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "call",
          amount: null,
          confidence: "high",
          seatNumber: null,
          position: null,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "コール");
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.8);
  });

  it("seatNumberが1-9範囲外の場合undefinedになる", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "call",
          amount: null,
          confidence: 0.9,
          seatNumber: 10,
          position: null,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "コール");
    expect(result).toHaveLength(1);
    expect(result[0].seatNumber).toBeUndefined();
  });

  it("コードブロック付きレスポンスをパースする", () => {
    const content =
      "```json\n" +
      JSON.stringify({
        commands: [
          {
            action: "raise",
            amount: 200,
            confidence: 0.95,
            seatNumber: 3,
            position: null,
          },
        ],
      }) +
      "\n```";
    const result = parseCommandsFromContent(content, "3番レイズ200");
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("raise");
    expect(result[0].amount).toBe(200);
    expect(result[0].seatNumber).toBe(3);
  });

  it("US1: action=null + amount=100 を受理し target は current", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: null,
          amount: 100,
          confidence: 0.9,
          seatNumber: null,
          position: null,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "100");
    expect(result).toHaveLength(1);
    expect.soft(result[0].action).toBeNull();
    expect.soft(result[0].amount).toBe(100);
    expect.soft(result[0].target).toEqual({ _kind: "current" });
    expect.soft(result[0].seatNumber).toBeUndefined();
  });

  it("US1: action=null + amount=300 + seatNumber=3 で target は seat", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: null,
          amount: 300,
          confidence: 0.9,
          seatNumber: 3,
          position: null,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "3番 300");
    expect(result).toHaveLength(1);
    expect.soft(result[0].action).toBeNull();
    expect.soft(result[0].amount).toBe(300);
    expect.soft(result[0].target).toEqual({ _kind: "seat", seatNumber: 3 });
    expect.soft(result[0].seatNumber).toBe(3);
  });

  it("US2: action='check-around' は target=current・amount=null に正規化", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "check-around",
          amount: 100,
          confidence: 0.9,
          seatNumber: 5,
          position: null,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "check around");
    expect(result).toHaveLength(1);
    expect.soft(result[0].action).toBe("check-around");
    expect.soft(result[0].amount).toBeNull();
    expect.soft(result[0].target).toEqual({ _kind: "current" });
    expect.soft(result[0].seatNumber).toBeUndefined();
  });

  it("US3: position='btn' は target={_kind:'position'} に解決される", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "fold",
          amount: null,
          confidence: 0.95,
          seatNumber: null,
          position: "btn",
        },
      ],
    });
    const result = parseCommandsFromContent(content, "BTN fold");
    expect(result).toHaveLength(1);
    expect.soft(result[0].action).toBe("fold");
    expect.soft(result[0].target).toEqual({
      _kind: "position",
      position: "btn",
    });
    expect.soft(result[0].seatNumber).toBeUndefined();
  });

  it("US3: position と seatNumber 両方指定では position を優先", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "call",
          amount: null,
          confidence: 0.9,
          seatNumber: 7,
          position: "sb",
        },
      ],
    });
    const result = parseCommandsFromContent(content, "SB call");
    expect(result).toHaveLength(1);
    expect.soft(result[0].target).toEqual({
      _kind: "position",
      position: "sb",
    });
  });

  it("FR-111: position='utg' は不正値として無視され target は current にフォールバック", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "fold",
          amount: null,
          confidence: 0.9,
          seatNumber: null,
          position: "utg",
        },
      ],
    });
    const result = parseCommandsFromContent(content, "UTG fold");
    expect(result).toHaveLength(1);
    expect.soft(result[0].target).toEqual({ _kind: "current" });
  });

  it("旧 LLM 出力（position フィールド無し）でも後方互換でパースできる", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "fold",
          amount: null,
          confidence: 0.9,
          seatNumber: 5,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "5番 fold");
    expect(result).toHaveLength(1);
    expect.soft(result[0].action).toBe("fold");
    expect.soft(result[0].target).toEqual({ _kind: "seat", seatNumber: 5 });
    expect.soft(result[0].seatNumber).toBe(5);
  });

  it("position='bb' は target={_kind:'position', position:'bb'} に解決される", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "call",
          amount: null,
          confidence: 0.9,
          seatNumber: null,
          position: "bb",
        },
      ],
    });
    const result = parseCommandsFromContent(content, "BB コール");
    expect(result).toHaveLength(1);
    expect
      .soft(result[0].target)
      .toEqual({ _kind: "position", position: "bb" });
  });

  it("無効なアクションはスキップされる", () => {
    const content = JSON.stringify({
      commands: [
        {
          action: "invalid_action",
          amount: null,
          confidence: 0.9,
          seatNumber: null,
          position: null,
        },
        {
          action: "call",
          amount: null,
          confidence: 0.9,
          seatNumber: null,
          position: null,
        },
      ],
    });
    const result = parseCommandsFromContent(content, "コール");
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("call");
  });
});
