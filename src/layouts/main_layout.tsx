import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { api } from "../api/client";
import { GlobalNav } from "../features/global_nav";
import { AppUpdateModal } from "../features/version_update";
import { useAppUpdater } from "../hooks/use_app_updater";
import { Snackbar } from "../ui/snackbar";

export function MainLayout() {
  const { state, startUpdate, dismiss } = useAppUpdater();
  const location = useLocation();

  // ルート変更時に Rust 側に通知する。
  // process_rfid で Auto/Manual モードを判別するために使用する。
  useEffect(() => {
    api.rfid.setActiveRoute(location.pathname).catch(() => {
      // Tauri コマンド未実装時は無視 (テスト環境等)
    });
  }, [location.pathname]);

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
