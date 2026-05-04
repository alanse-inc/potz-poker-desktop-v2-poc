import { trackClientSideError } from "../features/error_tracker";
import type {
  VoiceCommandTarget,
  VoicePokerAction,
  VoicePokerCommand,
} from "../types/voice_input";
import { isVoicePositionKey, VALID_VOICE_ACTIONS } from "../types/voice_input";
import { FILLER_WORDS } from "./voice_input_constants";

interface LlmCommandResult {
  action: string | null;
  amount: number | null;
  confidence: number;
  seatNumber: number | null;
  position: string | null;
}

export function extractJson(content: string): string {
  let cleaned = content.trim();
  const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(cleaned);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }
  return cleaned;
}

export function normalizeAction(action: string): string {
  if (action === "hold") return "fold";
  if (action === "goal") return "call";
  if (action === "おりる" || action === "おります") return "fold";
  if (action === "オールド" || action === "old") return "fold";
  return action;
}

export function isValidAction(action: string): action is VoicePokerAction {
  return (VALID_VOICE_ACTIONS as readonly string[]).includes(action);
}

export function buildVoiceCommandTarget(
  seatNumber: unknown,
  position: unknown,
): VoiceCommandTarget {
  if (isVoicePositionKey(position)) {
    return { _kind: "position", position };
  }
  if (
    typeof seatNumber === "number" &&
    Number.isInteger(seatNumber) &&
    seatNumber >= 1 &&
    seatNumber <= 9
  ) {
    return { _kind: "seat", seatNumber };
  }
  return { _kind: "current" };
}

export function isFillerWordOnly(text: string): boolean {
  const cleaned = text.trim();
  return FILLER_WORDS.includes(cleaned);
}

const ACTION_KEYWORDS = [
  "コール",
  "こーる",
  "call",
  "ゴール",
  "ごーる",
  "ボール",
  "ぼーる",
  "オール",
  "おーる",
  "ball",
  "coal",
  "goal",
  "フォールド",
  "ふぉーるど",
  "fold",
  "ホールド",
  "ほーるど",
  "hold",
  "オールド",
  "おーるど",
  "old",
  "おりる",
  "おります",
  "折る",
  "折ります",
  "ベット",
  "べっと",
  "bet",
  "ベッド",
  "ペット",
  "ぺっと",
  "フェット",
  "vet",
  "レイズ",
  "れいず",
  "raise",
  "レース",
  "race",
  "チェック",
  "ちぇっく",
  "check",
  "チェク",
  "オールイン",
  "おーるいん",
  "おるいん",
  "all-in",
  "allin",
  "オリン",
  "エクスポーズ",
  "えくすぽーず",
  "expose",
  "バック",
  "ばっく",
  "back",
  "戻る",
  "もどる",
  "すみません",
  "すいません",
  "違います",
  "違いました",
  "間違えました",
  "間違いました",
  "OK",
  "ok",
  "オーケー",
  "おーけー",
  "オッケー",
  "ネクストゲーム",
  "ねくすとげーむ",
  "次のゲーム",
];

export function containsActionKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return ACTION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export function cleanText(text: string): string {
  return text
    .replace(/[。！？!?.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCommandsFromContent(
  content: string,
  rawText: string,
): VoicePokerCommand[] {
  const jsonStr = extractJson(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    trackClientSideError(
      `[VoiceInputService] LLMレスポンスのJSONパースに失敗: ${content}`,
    );
    return [];
  }

  if (Array.isArray(parsed)) {
    parsed = { commands: parsed };
  }
  const obj = parsed as Record<string, unknown>;
  const rawCommands = Array.isArray(obj.commands) ? obj.commands : [];
  const commands: VoicePokerCommand[] = [];

  for (const item of rawCommands as LlmCommandResult[]) {
    let action: VoicePokerAction | null;
    if (item.action === null || item.action === undefined) {
      action = null;
    } else {
      const normalized = normalizeAction(item.action);
      if (!isValidAction(normalized)) {
        continue;
      }
      action = normalized;
    }

    const confidence =
      typeof item.confidence === "number" ? item.confidence : 0.8;

    const baseTarget = buildVoiceCommandTarget(item.seatNumber, item.position);
    const target: VoiceCommandTarget =
      action === "check-around" ? { _kind: "current" } : baseTarget;

    const command: VoicePokerCommand = {
      action,
      amount: action === "check-around" ? null : item.amount,
      confidence,
      target,
      rawText,
      timestamp: Date.now(),
      ...(target._kind === "seat" ? { seatNumber: target.seatNumber } : {}),
    };
    commands.push(command);
  }

  return commands;
}
