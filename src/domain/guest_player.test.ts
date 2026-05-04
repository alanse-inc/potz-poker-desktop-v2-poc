import { describe, expect, it } from "vitest";
import {
  isReservedGuestPlayerId,
  pickNextAvailableGuestId,
  RESERVED_GUEST_NICK_NAMES,
  RESERVED_GUEST_PLAYER_IDS,
  RESERVED_GUEST_POOL_SIZE,
} from "./guest_player";

describe("guest_player", () => {
  describe("RESERVED_GUEST_PLAYER_IDS", () => {
    it("16 桁 hex 形式の 10 件の固定 ID が生成される", () => {
      expect
        .soft(RESERVED_GUEST_PLAYER_IDS.length)
        .toBe(RESERVED_GUEST_POOL_SIZE);
      expect
        .soft(RESERVED_GUEST_PLAYER_IDS)
        .toEqual([
          "0000000000000000",
          "0000000000000001",
          "0000000000000002",
          "0000000000000003",
          "0000000000000004",
          "0000000000000005",
          "0000000000000006",
          "0000000000000007",
          "0000000000000008",
          "0000000000000009",
        ]);
    });

    it("全 ID が 16 桁 hex 形式である", () => {
      const hex16 = /^[0-9a-f]{16}$/;
      for (const id of RESERVED_GUEST_PLAYER_IDS) {
        expect.soft(hex16.test(id)).toBe(true);
      }
    });
  });

  describe("RESERVED_GUEST_NICK_NAMES", () => {
    it("各 ID に Guest N (1-10) の固定名がマッピングされる", () => {
      expect
        .soft(RESERVED_GUEST_NICK_NAMES["0000000000000000"])
        .toBe("Guest 1");
      expect
        .soft(RESERVED_GUEST_NICK_NAMES["0000000000000004"])
        .toBe("Guest 5");
      expect
        .soft(RESERVED_GUEST_NICK_NAMES["0000000000000009"])
        .toBe("Guest 10");
    });
  });

  describe("isReservedGuestPlayerId", () => {
    it("予約 ID は true を返す", () => {
      expect.soft(isReservedGuestPlayerId("0000000000000000")).toBe(true);
      expect.soft(isReservedGuestPlayerId("0000000000000009")).toBe(true);
    });

    it("予約 ID 以外 (legacy nanoid / hex16 範囲外) は false を返す", () => {
      expect.soft(isReservedGuestPlayerId("000000000000000a")).toBe(false);
      expect.soft(isReservedGuestPlayerId("V1StGXR8_Z5jdHi6B-myT")).toBe(false);
      expect.soft(isReservedGuestPlayerId("")).toBe(false);
    });
  });

  describe("pickNextAvailableGuestId", () => {
    it("空のセッションでは最小番号 (Guest 1) を返す", () => {
      const actual = pickNextAvailableGuestId([]);
      expect(actual).toBe("0000000000000000");
    });

    it("0,1 が使用中なら次の最小番号 (Guest 3) を返す", () => {
      const actual = pickNextAvailableGuestId([
        { id: "0000000000000000" },
        { id: "0000000000000001" },
      ]);
      expect(actual).toBe("0000000000000002");
    });

    it("途中の番号が空いていれば最小空き番号を再利用する", () => {
      const actual = pickNextAvailableGuestId([
        { id: "0000000000000000" },
        { id: "0000000000000002" },
        { id: "0000000000000003" },
      ]);
      expect(actual).toBe("0000000000000001");
    });

    it("プールが枯渇 (10 件すべて使用中) なら null を返す", () => {
      const fullPool = RESERVED_GUEST_PLAYER_IDS.map((id) => ({ id }));
      const actual = pickNextAvailableGuestId(fullPool);
      expect(actual).toBe(null);
    });

    it("予約 ID 以外 (legacy nanoid) は無視され最小番号が選ばれる", () => {
      const actual = pickNextAvailableGuestId([
        { id: "V1StGXR8_Z5jdHi6B-myT" },
      ]);
      expect(actual).toBe("0000000000000000");
    });
  });
});
