import { describe, expect, it, vi } from "vitest";
import type { User } from "../contexts/auth_context";
import {
  formatLicenseExpiry,
  getLicenseDisplayName,
  getUserLicense,
  isLicenseExpired,
  isLicenseExpiringSoon,
} from "./license";

// テスト用ユーザーファクトリ
function makeUser(overrides: Partial<User> = {}): User {
  return {
    sub: "user-123",
    ...overrides,
  };
}

describe("getUserLicense", () => {
  describe("user が null の場合", () => {
    it("none/inactive/isValid=false を返す", () => {
      const result = getUserLicense(null);
      expect(result).toEqual({
        type: "none",
        status: "inactive",
        isValid: false,
      });
    });
  });

  describe("license クレームなし", () => {
    it("subscription_status/license_type が個別クレームから取得される", () => {
      const user = makeUser({
        "https://potzpoker.com/subscription_status": "active",
        "https://potzpoker.com/license_type": "paid",
      });
      const result = getUserLicense(user);
      expect(result.type).toBe("paid");
      expect(result.status).toBe("active");
      expect(result.isValid).toBe(true);
    });

    it("クレームなしの場合は none/inactive/isValid=false", () => {
      const user = makeUser();
      const result = getUserLicense(user);
      expect(result.type).toBe("none");
      expect(result.status).toBe("inactive");
      expect(result.isValid).toBe(false);
    });
  });

  describe("license オブジェクトクレームあり", () => {
    it("paid ライセンス・active -> isValid=true", () => {
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "paid",
          status: "active",
          payment_method: "card",
          stripe_customer_id: "cus_abc123",
        },
      });
      const result = getUserLicense(user);
      expect(result.type).toBe("paid");
      expect(result.status).toBe("active");
      expect(result.isValid).toBe(true);
      expect(result.paymentMethod).toBe("card");
      expect(result.stripeCustomerId).toBe("cus_abc123");
    });

    it("free ライセンス・active -> isValid=true", () => {
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "free",
          status: "active",
        },
      });
      const result = getUserLicense(user);
      expect(result.type).toBe("free");
      expect(result.isValid).toBe(true);
    });

    it("trial ライセンスは free として扱う（後方互換性）", () => {
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "trial",
          status: "active",
        },
      });
      const result = getUserLicense(user);
      expect(result.type).toBe("free");
      expect(result.isValid).toBe(true);
    });

    it("test ライセンス・active -> isValid=true", () => {
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "test",
          status: "active",
        },
      });
      const result = getUserLicense(user);
      expect(result.type).toBe("test");
      expect(result.isValid).toBe(true);
    });

    it("unknown license_type -> none", () => {
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "unknown_type",
          status: "active",
        },
      });
      const result = getUserLicense(user);
      expect(result.type).toBe("none");
      expect(result.isValid).toBe(false);
    });

    it("status が expired -> isValid=false", () => {
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "paid",
          status: "expired",
        },
      });
      const result = getUserLicense(user);
      expect(result.isValid).toBe(false);
    });
  });

  describe("current_period_end", () => {
    it("未来の current_period_end -> isValid=true", () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 1日後
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "paid",
          status: "active",
          current_period_end: futureTimestamp,
        },
      });
      const result = getUserLicense(user);
      expect(result.isValid).toBe(true);
      expect(result.currentPeriodEnd).toBeInstanceOf(Date);
      expect(result.currentPeriodEnd?.getTime()).toBe(futureTimestamp * 1000);
    });

    it("過去の current_period_end -> isValid=false", () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 86400; // 1日前
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "paid",
          status: "active",
          current_period_end: pastTimestamp,
        },
      });
      const result = getUserLicense(user);
      expect(result.isValid).toBe(false);
    });

    it("個別クレームの current_period_end を取得する", () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;
      const user = makeUser({
        "https://potzpoker.com/subscription_status": "active",
        "https://potzpoker.com/license_type": "paid",
        "https://potzpoker.com/current_period_end": futureTimestamp,
      });
      const result = getUserLicense(user);
      expect(result.currentPeriodEnd).toBeInstanceOf(Date);
      expect(result.isValid).toBe(true);
    });
  });

  describe("subscriptionPlan", () => {
    it("subscription_plan クレームがある場合はそれを使う", () => {
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "paid",
          status: "active",
        },
        "https://potzpoker.com/subscription_plan": "Premium",
      });
      const result = getUserLicense(user);
      expect(result.subscriptionPlan).toBe("Premium");
    });

    it("paid -> Standard（デフォルトマッピング）", () => {
      const user = makeUser({
        "https://potzpoker.com/license": {
          license_type: "paid",
          status: "active",
        },
      });
      const result = getUserLicense(user);
      expect(result.subscriptionPlan).toBe("Standard");
    });

    it("none -> Free（デフォルトマッピング）", () => {
      const user = makeUser();
      const result = getUserLicense(user);
      expect(result.subscriptionPlan).toBe("Free");
    });
  });
});

describe("isLicenseExpiringSoon", () => {
  it("currentPeriodEnd がない場合は false", () => {
    const license = getUserLicense(
      makeUser({
        "https://potzpoker.com/license": {
          license_type: "paid",
          status: "active",
        },
      }),
    );
    expect(isLicenseExpiringSoon(license)).toBe(false);
  });

  it("isValid=false の場合は false", () => {
    const license = getUserLicense(null);
    expect(isLicenseExpiringSoon(license)).toBe(false);
  });

  it("3日後に期限切れ -> true (threshold=7)", () => {
    const threeDaysLater = Math.floor(Date.now() / 1000) + 3 * 86400;
    const user = makeUser({
      "https://potzpoker.com/license": {
        license_type: "paid",
        status: "active",
        current_period_end: threeDaysLater,
      },
    });
    const license = getUserLicense(user);
    expect(isLicenseExpiringSoon(license, 7)).toBe(true);
  });

  it("30日後に期限切れ -> false (threshold=7)", () => {
    const thirtyDaysLater = Math.floor(Date.now() / 1000) + 30 * 86400;
    const user = makeUser({
      "https://potzpoker.com/license": {
        license_type: "paid",
        status: "active",
        current_period_end: thirtyDaysLater,
      },
    });
    const license = getUserLicense(user);
    expect(isLicenseExpiringSoon(license, 7)).toBe(false);
  });

  it("カスタム threshold が適用される", () => {
    const fifteenDaysLater = Math.floor(Date.now() / 1000) + 15 * 86400;
    const user = makeUser({
      "https://potzpoker.com/license": {
        license_type: "paid",
        status: "active",
        current_period_end: fifteenDaysLater,
      },
    });
    const license = getUserLicense(user);
    expect(isLicenseExpiringSoon(license, 7)).toBe(false);
    expect(isLicenseExpiringSoon(license, 30)).toBe(true);
  });
});

describe("isLicenseExpired", () => {
  it("currentPeriodEnd がない場合は false（期限なし）", () => {
    const user = makeUser({
      "https://potzpoker.com/license": {
        license_type: "paid",
        status: "active",
      },
    });
    const license = getUserLicense(user);
    expect(isLicenseExpired(license)).toBe(false);
  });

  it("未来の期限 -> false", () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;
    const user = makeUser({
      "https://potzpoker.com/license": {
        license_type: "paid",
        status: "active",
        current_period_end: futureTimestamp,
      },
    });
    const license = getUserLicense(user);
    expect(isLicenseExpired(license)).toBe(false);
  });

  it("過去の期限 -> true", () => {
    const pastTimestamp = Math.floor(Date.now() / 1000) - 86400;
    const user = makeUser({
      "https://potzpoker.com/license": {
        license_type: "paid",
        status: "active",
        current_period_end: pastTimestamp,
      },
    });
    // getUserLicense は isValid=false を返すが、currentPeriodEnd は保持する
    const license = getUserLicense(user);
    expect(isLicenseExpired(license)).toBe(true);
  });

  it("Date.now() でモック可能", () => {
    const fixedTime = new Date("2025-06-01T00:00:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedTime);

    const pastTimestamp = Math.floor(
      new Date("2025-05-01T00:00:00Z").getTime() / 1000,
    );
    const license = {
      type: "paid" as const,
      status: "active" as const,
      isValid: false,
      currentPeriodEnd: new Date(pastTimestamp * 1000),
    };
    expect(isLicenseExpired(license)).toBe(true);

    vi.restoreAllMocks();
  });
});

describe("formatLicenseExpiry", () => {
  it("undefined -> 期限なし", () => {
    expect(formatLicenseExpiry(undefined)).toBe("期限なし");
  });

  it("Date を日本語形式でフォーマットする", () => {
    const date = new Date("2025-12-02T00:00:00Z");
    const result = formatLicenseExpiry(date);
    // ロケールによって若干異なる可能性があるため、年・月・日が含まれることを確認
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/12/);
    expect(result).toMatch(/2/);
  });
});

describe("getLicenseDisplayName", () => {
  it("paid -> 有料プラン", () => {
    expect(getLicenseDisplayName("paid")).toBe("有料プラン");
  });

  it("free -> 無料プラン", () => {
    expect(getLicenseDisplayName("free")).toBe("無料プラン");
  });

  it("test -> テストアカウント", () => {
    expect(getLicenseDisplayName("test")).toBe("テストアカウント");
  });

  it("none -> 未登録", () => {
    expect(getLicenseDisplayName("none")).toBe("未登録");
  });
});
