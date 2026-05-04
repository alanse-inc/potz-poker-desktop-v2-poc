const ALLOWED_HOSTNAME = "potz.poker";
const PLAYER_ID_REGEX = /^[0-9a-f]{16}$/;

function isValidPlayerId(id: string): boolean {
  return PLAYER_ID_REGEX.test(id);
}

/**
 * QRリーダー入力をURL解釈しやすい形に正規化する
 * Windows環境で起きやすい入力揺れを吸収する:
 * - 全角記号（NFKC正規化）
 * - バックスラッシュ区切り
 * - スキーム崩れ（https:/ / https:///）
 * - 大文字化（Caps Lock ON / QR Alphanumericモード）
 * - スペース誤挿入（USB QRリーダーのShiftキータイミングずれ）
 * - プロトコル相対URL（//potz.poker/...）
 */
function normalizeQrInput(decodedText: string): string {
  const trimmed = decodedText.trim();
  const normalized = trimmed
    .normalize("NFKC")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !((code >= 0 && code <= 31) || code === 127);
    })
    .join("")
    .replace(/\\/g, "/")
    .replace(/ /g, "")
    .toLowerCase();

  if (normalized.startsWith(`${ALLOWED_HOSTNAME}/`)) {
    return `https://${normalized}`;
  }

  // プロトコル相対URL（//potz.poker/...）→ https:// を付与
  if (normalized.startsWith("//")) {
    return `https:${normalized}`;
  }

  // https:/ または https:/// → https:// に補正
  if (normalized.startsWith("https:/") && !normalized.startsWith("https://")) {
    return normalized.replace(/^https:\/+/, "https://");
  }
  // http:/ または http:/// → http:// に補正
  if (normalized.startsWith("http:/") && !normalized.startsWith("http://")) {
    return normalized.replace(/^http:\/+/, "http://");
  }

  return normalized;
}

/**
 * QRコードからプレイヤーIDを抽出・検証する
 * 以下の2つのフォーマットをサポート:
 *   1. URL形式: https://potz.poker/checkin/{playerId}
 *   2. 直接ID形式: {playerId}（hexId16形式 - USB QRリーダーのフォールバック）
 * playerIdはhexId16形式（16桁の小文字16進数）のみ許可
 *
 * @param decodedText - QRコードから読み取ったテキスト
 * @returns 検証済みのplayerId（16桁の小文字16進数）または null
 */
export function extractPlayerId(input: string): string | null {
  try {
    return extractPlayerIdOrThrow(input);
  } catch {
    return null;
  }
}

/**
 * extractPlayerId の内部実装（throw バージョン）
 * テスト用に throw する版も export する
 */
export function extractPlayerIdOrThrow(decodedText: string): string {
  const normalizedText = normalizeQrInput(decodedText);

  // hexId16形式の直接ID（USB QRリーダーがURL形式でなくIDのみを出力する場合のフォールバック）
  if (isValidPlayerId(normalizedText)) {
    return normalizedText;
  }

  try {
    const url = new URL(normalizedText);

    // ドメイン検証
    if (url.hostname !== ALLOWED_HOSTNAME) {
      throw new Error(`無効なドメインです（期待値: ${ALLOWED_HOSTNAME}）`);
    }

    // クエリパラメータの検証: チェックインURLには不要
    if (url.search) {
      throw new Error("QRコードフォーマットが無効です");
    }

    // ポート番号の検証: 標準ポート以外は許可しない
    if (url.port) {
      throw new Error("QRコードフォーマットが無効です");
    }

    // パス構造の厳密な検証
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 2 || pathParts[0] !== "checkin") {
      throw new Error("QRコードフォーマットが無効です");
    }

    const playerId = decodeURIComponent(pathParts[1]);

    // playerIdの存在検証
    if (!playerId || playerId.length === 0) {
      throw new Error("プレイヤーIDが含まれていません");
    }

    // hexId16形式のバリデーション
    if (!isValidPlayerId(playerId)) {
      throw new Error(
        "無効なプレイヤーID形式です。正しいQRコードをスキャンしてください。",
      );
    }

    return playerId;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "QRコードの解析に失敗しました";
    throw new Error(message);
  }
}
