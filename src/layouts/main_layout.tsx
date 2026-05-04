import { Outlet } from "react-router";
import { GlobalNav } from "../features/global_nav";
import { Snackbar } from "../ui/snackbar";

export function MainLayout() {
  return (
    <div className="flex h-screen w-screen flex-row bg-black-deep">
      <GlobalNav />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
        <Snackbar />
      </div>
    </div>
  );
}
