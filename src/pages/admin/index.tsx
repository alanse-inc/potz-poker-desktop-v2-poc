import { BasicPage } from "../../ui/page/basic";

export function AdminPage() {
  const adminUrl = import.meta.env.VITE_ADMIN_APP_URL as string | undefined;

  return (
    <BasicPage>
      <div className="flex h-full w-full flex-col">
        {adminUrl ? (
          // Tauri では <webview> ではなく <iframe> を使用
          // TODO: Tauri の webview API (WebviewWindow) を使った別ウィンドウ表示への切り替えを検討
          <iframe
            src={adminUrl}
            title="Admin"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-white">
            VITE_ADMIN_APP_URL が設定されていません
          </div>
        )}
      </div>
    </BasicPage>
  );
}
