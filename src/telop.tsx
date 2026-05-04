import "./css/index.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api/client";
import { TelopPage } from "./pages/telop";
import type { TelopState } from "./types";

/**
 * テロップウィンドウのエントリーポイント
 *
 * - mode フィールドが設定されている場合は 4 モードテロップを表示
 * - mode フィールドがない（旧 API 互換）場合はシンプルなテキスト表示
 */
function TelopApp() {
  const [state, setState] = useState<TelopState>({
    message: "",
    color: "transparent",
  });

  useEffect(() => {
    api.telop
      .getState()
      .then(setState)
      .catch(() => {});
    const unsubscribe = api.notifications.onTelopUpdated(setState);
    return () => {
      unsubscribe.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // mode フィールドがある場合は 4 モードテロップを表示
  if (state.mode) {
    return (
      <div
        className="h-screen w-screen"
        style={{ backgroundColor: state.color || "transparent" }}
      >
        <TelopPage />
      </div>
    );
  }

  // 旧 API 互換: シンプルなテキスト表示
  return (
    <div
      className="flex h-screen w-screen items-center justify-center font-bold text-6xl"
      style={{ backgroundColor: state.color }}
    >
      {state.message}
    </div>
  );
}

const rootElement = document.getElementById("root") as HTMLElement;
createRoot(rootElement).render(
  <StrictMode>
    <TelopApp />
  </StrictMode>,
);
