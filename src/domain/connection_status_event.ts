/**
 * RFID リーダーのシリアル接続状態イベント
 *
 * - isConnected: デバイスが接続されているか
 * - deviceSerialNumber: 接続中のデバイスのシリアル番号 (未接続時は null)
 */
export type ConnectionStatusEvent = {
  isConnected: boolean;
  deviceSerialNumber: string | null;
};
