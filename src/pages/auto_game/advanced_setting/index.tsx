/**
 * Auto Game 詳細設定画面
 *
 * Electron 版では /settings/table-name にリダイレクトしていたため、
 * Tauri 版でも同様に settings/telop にリダイレクトする
 */

import { Navigate } from "react-router";

export function AutoGameAdvancedSetting() {
  return <Navigate to="/settings/telop" replace />;
}
