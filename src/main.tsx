import "./css/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { RouterProvider } from "react-router";
import { AuthProvider } from "./contexts/auth_context";
import { AutoBoardProvider } from "./contexts/auto_board_context";
import { BoardProvider } from "./contexts/board_context";
import { CardPlacedEventProvider } from "./contexts/card_placed_event";
import { InitialBoardProvider } from "./contexts/initial_board_context";
import { OperatorProvider } from "./contexts/operator_context";
import { RFIDCardMappingProvider } from "./contexts/rfid_card_mapping_context";
import { SessionProvider } from "./contexts/session_context";
import { TelopProvider } from "./contexts/telop_context";
import { mainRouter } from "./routes";
import { initMixpanel } from "./services/analytics";
import { initializeSentry, isSentryEnabled, Sentry } from "./services/sentry";

initializeSentry();
initMixpanel();

// biome-ignore lint/suspicious/noExplicitAny: React 19 Sentry ErrorBoundary type compatibility issue
const ErrorBoundary = Sentry.ErrorBoundary as any;

const rootElement = document.getElementById("root") as HTMLElement;
const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <ErrorBoundary
      fallback={() => (
        <div>予期しないエラーが発生しました。アプリを再起動してください。</div>
      )}
      showDialog={isSentryEnabled}
    >
      <AuthProvider>
        <SessionProvider>
          <OperatorProvider>
            <RFIDCardMappingProvider>
              <InitialBoardProvider>
                <CardPlacedEventProvider>
                  <TelopProvider>
                    <BoardProvider>
                      <AutoBoardProvider>
                        <RouterProvider router={mainRouter} />
                        <Toaster />
                      </AutoBoardProvider>
                    </BoardProvider>
                  </TelopProvider>
                </CardPlacedEventProvider>
              </InitialBoardProvider>
            </RFIDCardMappingProvider>
          </OperatorProvider>
        </SessionProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
