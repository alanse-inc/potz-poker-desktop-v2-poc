import type { Card } from "../types";

export type { Card };

/**
 * コミュニティカードのスロット名
 */
export type CommunityCardSlot = "flop1" | "flop2" | "flop3" | "turn" | "river";

/**
 * ロケート番号 (RFID リーダーのスロット番号 "0"〜"4")
 */
export type LocateNumber = "0" | "1" | "2" | "3" | "4";

/**
 * カードが配布される位置
 *
 * - playerHand: プレイヤーのホールカード (seat: 1-9)
 * - communityCard: コミュニティカード (slot: 文字列名)
 * - burnCard: バーンカード
 */
export type CardPosition =
  | { type: "playerHand"; seat: number }
  | { type: "communityCard"; slot: CommunityCardSlot }
  | { type: "burnCard" };

/**
 * デッキ登録画面でRFIDカードが検出された場合のイベント
 */
type RegisterCardPlacedEvent = {
  type: "register";
  rfid: string;
};

export type GameCardPlacedEvent = {
  card: Card;
  position: CardPosition;
};

/**
 * デッキに登録されていないRFIDカードが検出された場合のイベント
 */
type UnregisteredCardPlacedEvent = {
  type: "unregistered";
  rfid: string;
};

export type CardPlacedEvent =
  | RegisterCardPlacedEvent
  | GameCardPlacedEvent
  | UnregisteredCardPlacedEvent;

export const toCommunityCardSlotFromLocateNumber = (
  locateNumber: LocateNumber,
): CommunityCardSlot => {
  switch (locateNumber) {
    case "0":
      return "flop1";
    case "1":
      return "flop2";
    case "2":
      return "flop3";
    case "3":
      return "turn";
    case "4":
      return "river";
    default: {
      const exhaustiveCheck: never = locateNumber;
      return exhaustiveCheck;
    }
  }
};

export const isGameCardPlacedEvent = (
  event: CardPlacedEvent,
): event is GameCardPlacedEvent => {
  return "card" in event && "position" in event;
};

export const isRegisterCardPlacedEvent = (
  event: CardPlacedEvent,
): event is RegisterCardPlacedEvent => {
  return "type" in event && event.type === "register";
};

export const isUnregisteredCardPlacedEvent = (
  event: CardPlacedEvent,
): event is UnregisteredCardPlacedEvent => {
  return "type" in event && event.type === "unregistered";
};
