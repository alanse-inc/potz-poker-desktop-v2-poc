import "./css/index.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api/client";
import type { TelopState } from "./types";

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
