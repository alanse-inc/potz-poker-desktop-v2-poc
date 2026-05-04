import { Navigate } from "react-router";

export function FirstGameAdvancedSetting() {
  return <Navigate to="/settings/table-name?mode=first_game" replace />;
}
