import { Navigate } from "react-router";

export function NextGameAdvancedSetting() {
  return <Navigate to="/settings/table-name?mode=next_game" replace />;
}
