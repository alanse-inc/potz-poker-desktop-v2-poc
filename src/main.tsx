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

const rootElement = document.getElementById("root") as HTMLElement;
const root = createRoot(rootElement);
root.render(
  <StrictMode>
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
  </StrictMode>,
);
