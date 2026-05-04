import { describe, expect, it } from "vitest";
import type { Card } from "../types";
import type { CardPlacedEvent } from "./card_placement_event";
import {
  isGameCardPlacedEvent,
  isRegisterCardPlacedEvent,
  isUnregisteredCardPlacedEvent,
  toCommunityCardSlotFromLocateNumber,
} from "./card_placement_event";

const aceOfSpades: Card = { suit: "spade", value: "A" };

describe("card_placement_event", () => {
  describe("isGameCardPlacedEvent", () => {
    it("GameCardPlacedEventの場合はtrueを返す", () => {
      const event: CardPlacedEvent = {
        card: aceOfSpades,
        position: { type: "playerHand", seat: 1 },
      };

      expect(isGameCardPlacedEvent(event)).toBe(true);
    });

    it("RegisterCardPlacedEventの場合はfalseを返す", () => {
      const event: CardPlacedEvent = {
        type: "register",
        rfid: "0468A5DAAB1291",
      };

      expect(isGameCardPlacedEvent(event)).toBe(false);
    });

    it("UnregisteredCardPlacedEventの場合はfalseを返す", () => {
      const event: CardPlacedEvent = {
        type: "unregistered",
        rfid: "0468A5DAAB1291",
      };

      expect(isGameCardPlacedEvent(event)).toBe(false);
    });
  });

  describe("isRegisterCardPlacedEvent", () => {
    it("RegisterCardPlacedEventの場合はtrueを返す", () => {
      const event: CardPlacedEvent = {
        type: "register",
        rfid: "0468A5DAAB1291",
      };

      expect(isRegisterCardPlacedEvent(event)).toBe(true);
    });

    it("GameCardPlacedEventの場合はfalseを返す", () => {
      const event: CardPlacedEvent = {
        card: aceOfSpades,
        position: { type: "playerHand", seat: 1 },
      };

      expect(isRegisterCardPlacedEvent(event)).toBe(false);
    });

    it("UnregisteredCardPlacedEventの場合はfalseを返す", () => {
      const event: CardPlacedEvent = {
        type: "unregistered",
        rfid: "0468A5DAAB1291",
      };

      expect(isRegisterCardPlacedEvent(event)).toBe(false);
    });
  });

  describe("isUnregisteredCardPlacedEvent", () => {
    it("UnregisteredCardPlacedEventの場合はtrueを返す", () => {
      const event: CardPlacedEvent = {
        type: "unregistered",
        rfid: "0468A5DAAB1291",
      };

      expect(isUnregisteredCardPlacedEvent(event)).toBe(true);
    });

    it("RegisterCardPlacedEventの場合はfalseを返す", () => {
      const event: CardPlacedEvent = {
        type: "register",
        rfid: "0468A5DAAB1291",
      };

      expect(isUnregisteredCardPlacedEvent(event)).toBe(false);
    });

    it("GameCardPlacedEventの場合はfalseを返す", () => {
      const event: CardPlacedEvent = {
        card: aceOfSpades,
        position: { type: "playerHand", seat: 1 },
      };

      expect(isUnregisteredCardPlacedEvent(event)).toBe(false);
    });
  });

  describe("toCommunityCardSlotFromLocateNumber", () => {
    it("0 → flop1", () => {
      expect(toCommunityCardSlotFromLocateNumber("0")).toBe("flop1");
    });

    it("1 → flop2", () => {
      expect(toCommunityCardSlotFromLocateNumber("1")).toBe("flop2");
    });

    it("2 → flop3", () => {
      expect(toCommunityCardSlotFromLocateNumber("2")).toBe("flop3");
    });

    it("3 → turn", () => {
      expect(toCommunityCardSlotFromLocateNumber("3")).toBe("turn");
    });

    it("4 → river", () => {
      expect(toCommunityCardSlotFromLocateNumber("4")).toBe("river");
    });
  });
});
