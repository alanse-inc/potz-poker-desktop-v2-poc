import { createMemoryRouter } from "react-router";
import { MainLayout } from "../layouts/main_layout";
import { AccountPage } from "../pages/account";
import { AdminPage } from "../pages/admin";
import { CheckIn } from "../pages/check_in";
import { Debug } from "../pages/debug";
import { DeckHome } from "../pages/deck";
import { DeckChoose } from "../pages/deck/choose";
import { DeckEdit } from "../pages/deck/edit";
import { DeckRegister } from "../pages/deck/register";
import { FirstGameAdvancedSetting } from "../pages/game/first_game/advanced_setting";
import { FirstGameSelectBtn } from "../pages/game/first_game/select_btn";
import { FirstGameSetting } from "../pages/game/first_game/setting";
import { GamePlaying } from "../pages/game/playing";
import { SelectBtn } from "../pages/game/select_btn";
import { GameSetting } from "../pages/game/setting";
import { Home } from "../pages/home";
import { NextGame } from "../pages/next_game";
import { SessionEdit } from "../pages/session/edit";
import { SessionList } from "../pages/session/list";
import { RemoteSettings } from "../pages/settings/remote";
import { TableNameSettings } from "../pages/settings/table_name";
import { TelopSettings } from "../pages/settings/telop";
import { VoiceInputSettings } from "../pages/settings/voice_input";

export const mainRouter = createMemoryRouter([
  {
    element: <MainLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/account", element: <AccountPage /> },
      { path: "/admin", element: <AdminPage /> },
      { path: "/check-in", element: <CheckIn /> },
      { path: "/game/setting", element: <GameSetting /> },
      { path: "/game/select-btn", element: <SelectBtn /> },
      { path: "/game/playing", element: <GamePlaying /> },
      { path: "/game/next-game", element: <NextGame /> },
      { path: "/game/first-game/setting", element: <FirstGameSetting /> },
      { path: "/game/first-game/select-btn", element: <FirstGameSelectBtn /> },
      {
        path: "/game/first-game/advanced-setting",
        element: <FirstGameAdvancedSetting />,
      },
      { path: "/settings/telop", element: <TelopSettings /> },
      { path: "/settings/remote", element: <RemoteSettings /> },
      { path: "/settings/table-name", element: <TableNameSettings /> },
      { path: "/settings/voice-input", element: <VoiceInputSettings /> },
      { path: "/debug", element: <Debug /> },
      { path: "/deck", element: <DeckHome /> },
      { path: "/deck/choose", element: <DeckChoose /> },
      { path: "/deck/edit/:id", element: <DeckEdit /> },
      { path: "/deck/register", element: <DeckRegister /> },
      { path: "/session/list", element: <SessionList /> },
      { path: "/session/edit/:id", element: <SessionEdit /> },
    ],
  },
]);
