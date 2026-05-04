/**
 * 予約済みゲストプレイヤー ID プール
 *
 * 手動追加プレイヤー (First Game / Next Game / Auto Mode の JOIN UI) で利用する
 * 16 桁 hex 形式の決定論的 ID プール。backend の `players` テーブルに事前 seed されている
 * ため、ここから割り当てる限り `texas_holdem_hand_*` の参照整合性は崩れない。
 *
 * - 値: `00000000000000{0-9}` 固定 10 件
 * - nick_name: 表示用の固定名 (`Guest 1` ... `Guest 10`)
 *   - 操作員が UI で入力する任意の名前は `players.nick_name` に永続化されない
 *     (DB 上は固定の `Guest N` で記録される設計)
 */
export const RESERVED_GUEST_POOL_SIZE = 10;

export const RESERVED_GUEST_PLAYER_IDS: readonly string[] = Array.from(
  { length: RESERVED_GUEST_POOL_SIZE },
  (_, index) => `000000000000000${index}`.slice(-16),
);

const RESERVED_GUEST_ID_SET: ReadonlySet<string> = new Set(
  RESERVED_GUEST_PLAYER_IDS,
);

export const RESERVED_GUEST_NICK_NAMES: Readonly<Record<string, string>> =
  Object.fromEntries(
    RESERVED_GUEST_PLAYER_IDS.map((id, index) => [id, `Guest ${index + 1}`]),
  );

export function isReservedGuestPlayerId(id: string): boolean {
  return RESERVED_GUEST_ID_SET.has(id);
}

/**
 * 現在のセッションプレイヤーから未使用の最小番号予約 ID を返す。
 * プールが枯渇している (10 件すべて使用中) 場合は null を返し、
 * 呼び出し側はエラー UI を表示する責務を負う。
 */
export function pickNextAvailableGuestId(
  currentPlayers: readonly { id: string }[],
): string | null {
  const usedIds = new Set(currentPlayers.map((p) => p.id));
  for (const candidate of RESERVED_GUEST_PLAYER_IDS) {
    if (!usedIds.has(candidate)) {
      return candidate;
    }
  }
  return null;
}
