/**
 * Board/InitialBoard の変更を監視して適切なルートに遷移するフック（Tauri 版）
 *
 * @remarks
 * Electron 版では SSE（Server-Sent Events）を通じてサーバー側の状態変更を受け取り、
 * メインウィンドウ ↔ telop ウィンドウ間でルートを同期していた。
 * Tauri 版ではこの仕組みがまだ未実装のため、シグネチャのみ保ち中身は no-op にしている。
 *
 * TODO: Tauri event listen を使った SSE 相当の同期処理を実装する
 */
export function useRouteSync(): void {
  // no-op: Tauri 版でのマルチウィンドウルート同期は未実装
}
