import { useLocation, useNavigate } from "react-router";
import accountIcon from "./icons/account.svg?raw";
// TODO: トーナメント管理機能の実装後に表示
// import adminIcon from "./icons/admin.svg?raw";
import deckIcon from "./icons/deck.svg?raw";
import gameIcon from "./icons/game.svg?raw";
import sessionIcon from "./icons/session.svg?raw";
import settingIcon from "./icons/setting.svg?raw";
import { MenuItem } from "./menu_item";

type ActiveMenu = "game" | "session" | "deck" | "setting" | "admin" | "account";

function resolveActiveByPath(pathname: string): ActiveMenu | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/account")) return "account";
  if (pathname.startsWith("/settings")) return "setting";
  if (pathname.includes("advanced-setting")) return "setting";
  if (pathname.startsWith("/session")) return "session";
  if (pathname.startsWith("/deck")) return "deck";
  if (
    pathname.startsWith("/game") ||
    pathname.startsWith("/auto_game") ||
    pathname === "/"
  ) {
    return "game";
  }
  return null;
}

export function GlobalNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const active = resolveActiveByPath(location.pathname);

  return (
    <nav
      className="z-20 flex h-full w-[56px] shrink-0 flex-col items-center overflow-y-auto bg-black-deep py-[20px] [&::-webkit-scrollbar]:hidden"
      style={{
        boxShadow: "4px 0 4px rgba(0, 0, 0, 0.16)",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div className="flex w-full flex-col items-center gap-[14px]">
        <MenuItem
          active={active === "game"}
          iconSvg={gameIcon}
          label="Game"
          onClick={() => navigate("/game/setting")}
        />
        <MenuItem
          active={active === "session"}
          iconSvg={sessionIcon}
          label="Session"
          onClick={() => navigate("/session/list")}
        />
        <MenuItem
          active={active === "deck"}
          iconSvg={deckIcon}
          label="Deck"
          onClick={() => navigate("/deck/choose")}
        />
        <MenuItem
          active={active === "setting"}
          iconSvg={settingIcon}
          label="Setting"
          onClick={() => navigate("/settings/table-name?mode=first_game")}
        />
        {/* TODO: トーナメント管理機能の実装後に表示
        <MenuItem
          active={active === "admin"}
          iconSvg={adminIcon}
          label="Admin"
          onClick={() => navigate("/admin")}
        />
        */}
        <MenuItem
          active={active === "account"}
          iconSvg={accountIcon}
          label="Account"
          onClick={() => navigate("/account")}
        />
      </div>
    </nav>
  );
}
