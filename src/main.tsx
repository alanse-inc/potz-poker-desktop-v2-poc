import "./css/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { RouterProvider } from "react-router";
import { AuthProvider } from "./contexts/auth_context";
import { BoardProvider } from "./contexts/board_context";
import { mainRouter } from "./routes";

const rootElement = document.getElementById("root") as HTMLElement;
const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <AuthProvider>
      <BoardProvider>
        <RouterProvider router={mainRouter} />
        <Toaster />
      </BoardProvider>
    </AuthProvider>
  </StrictMode>,
);
