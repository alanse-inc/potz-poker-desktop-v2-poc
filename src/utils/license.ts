import type { User } from "../contexts/auth_context";

export type LicenseType = "paid" | "free" | "test" | "none";
export type LicenseStatus = "active" | "expired" | "inactive";
export type PaymentMethod = "card" | "bank_transfer";

/**
 * ライセンス情報を表すインターフェース
 * @see docs/license-specification.md
 */
export interface LicenseInfo {
  type: LicenseType;
  status: LicenseStatus;
  isValid: boolean;
  /** 有効期限（Unix timestampから変換後） */
  currentPeriodEnd?: Date;
  /** 決済方法（paidのみ） */
  paymentMethod?: PaymentMethod;
  /** Stripe顧客ID（card決済のみ） */
  stripeCustomerId?: string;
  subscriptionPlan?: string;
}

/**
 * Auth0から取得するライセンスオブジェクトの型
 * @see docs/license-specification.md
 */
type Auth0License = {
  license_type?: string;
  status?: string;
  payment_method?: string;
  stripe_customer_id?: string;
  current_period_end?: number; // Unix timestamp (seconds)
};

/**
 * ユーザーのライセンス情報を取得
 * @see docs/license-specification.md
 */
export function getUserLicense(user: User | null): LicenseInfo {
  if (!user) {
    return {
      type: "none",
      status: "inactive",
      isValid: false,
    };
  }

  // Auth0 Actionから付与されたクレームを取得
  // licenseオブジェクト内の情報を優先
  const license = user["https://potzpoker.com/license"] as
    | Auth0License
    | undefined;

  // フィールドの取得（licenseオブジェクト > 個別クレーム > デフォルト）
  const status = (license?.status ||
    user["https://potzpoker.com/subscription_status"] ||
    "inactive") as LicenseStatus;

  const rawLicenseType =
    license?.license_type || user["https://potzpoker.com/license_type"];

  // license_typeの正規化: "trial"は"free"として扱う（後方互換性）
  let licenseType: LicenseType;
  if (rawLicenseType === "paid") {
    licenseType = "paid";
  } else if (
    rawLicenseType === "free" ||
    rawLicenseType === "test" ||
    rawLicenseType === "trial"
  ) {
    // trial は free として扱う（後方互換性）
    licenseType = rawLicenseType === "trial" ? "free" : rawLicenseType;
  } else {
    licenseType = "none";
  }

  // current_period_end の取得（Unix timestamp -> Date変換）
  const currentPeriodEndTimestamp =
    license?.current_period_end ||
    (user["https://potzpoker.com/current_period_end"] as number | undefined);
  const currentPeriodEnd = currentPeriodEndTimestamp
    ? new Date(currentPeriodEndTimestamp * 1000) // Unix timestamp (秒) -> ミリ秒
    : undefined;

  // payment_method と stripe_customer_id
  const paymentMethod = license?.payment_method as PaymentMethod | undefined;
  const stripeCustomerId = license?.stripe_customer_id;

  // ライセンスが有効かどうか判定
  // 1. ライセンスタイプが有効であること
  // 2. ステータスがactiveであること
  // 3. current_period_endがある場合、現在時刻より未来であること
  const validLicenseTypes: LicenseType[] = ["paid", "free", "test"];
  const isNotExpired =
    !currentPeriodEnd || currentPeriodEnd.getTime() > Date.now();
  const isValid =
    validLicenseTypes.includes(licenseType) &&
    status === "active" &&
    isNotExpired;

  // subscriptionPlanの表示名を決定
  const rawPlan = user["https://potzpoker.com/subscription_plan"] as
    | string
    | undefined;
  const planMapping: Record<string, string> = {
    paid: "Standard",
    free: "Standard",
    test: "Standard",
    none: "Free",
  };
  const displayPlan = rawPlan || planMapping[licenseType] || "Free";

  return {
    type: licenseType,
    status,
    isValid,
    currentPeriodEnd,
    paymentMethod,
    stripeCustomerId,
    subscriptionPlan: displayPlan,
  };
}

/**
 * ライセンスの有効期限が近いかチェック
 * @param license ライセンス情報
 * @param daysThreshold 期限切れとみなす残り日数（デフォルト: 7日）
 */
export function isLicenseExpiringSoon(
  license: LicenseInfo,
  daysThreshold = 7,
): boolean {
  if (!license.isValid || !license.currentPeriodEnd) {
    return false;
  }

  const now = Date.now();
  const expiryTime = license.currentPeriodEnd.getTime();
  const daysRemaining = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));

  return daysRemaining >= 0 && daysRemaining <= daysThreshold;
}

/**
 * ライセンスが期限切れかどうかをチェック
 */
export function isLicenseExpired(license: LicenseInfo): boolean {
  // current_period_end がない場合は期限なし（有効）
  if (!license.currentPeriodEnd) {
    return false;
  }

  return Date.now() > license.currentPeriodEnd.getTime();
}

/**
 * ライセンスの有効期限をフォーマット
 * @param currentPeriodEnd 有効期限（Date または undefined）
 * @returns フォーマットされた日付文字列（例: "2025年12月2日"）または「期限なし」
 */
export function formatLicenseExpiry(
  currentPeriodEnd: Date | undefined,
): string {
  if (!currentPeriodEnd) {
    return "期限なし";
  }
  return currentPeriodEnd.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * ライセンスタイプの表示名を取得
 */
export function getLicenseDisplayName(type: LicenseType): string {
  const displayNames: Record<LicenseType, string> = {
    paid: "有料プラン",
    free: "無料プラン",
    test: "テストアカウント",
    none: "未登録",
  };
  return displayNames[type];
}
