import { Outlet } from "react-router";
import { GlobalNav } from "../features/global_nav";
import { AppUpdateModal } from "../features/version_update";
import { useAppUpdater } from "../hooks/use_app_updater";
import { Snackbar } from "../ui/snackbar";

export function MainLayout() {
  const { state, startUpdate, dismiss } = useAppUpdater();

  return (
    <div className="flex h-screen w-screen flex-row bg-black-deep">
      <GlobalNav />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
        <Snackbar />
      </div>
      <AppUpdateModal
        state={state}
        onUpdate={startUpdate}
        onDismiss={dismiss}
      />
    </div>
  );
}
