import { Outlet, useLocation, useNavigate } from "react-router";
import { Snackbar } from "../ui/snackbar";

type NavItem = {
  label: string;
  to: string;
  matcher: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "ホーム",
    to: "/",
    matcher: (p) => p === "/",
  },
  {
    label: "チェックイン",
    to: "/check-in",
    matcher: (p) => p === "/check-in",
  },
  {
    label: "ゲーム",
    to: "/game/playing",
    matcher: (p) => p.startsWith("/game"),
  },
  {
    label: "デッキ",
    to: "/deck",
    matcher: (p) => p.startsWith("/deck"),
  },
  {
    label: "セッション",
    to: "/session/list",
    matcher: (p) => p.startsWith("/session"),
  },
  {
    label: "設定",
    to: "/settings/telop",
    matcher: (p) => p.startsWith("/settings"),
  },
  {
    label: "アカウント",
    to: "/account",
    matcher: (p) => p === "/account",
  },
];

function GlobalNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="flex h-12 w-full items-center gap-4 border-gray-800 border-b bg-black-deep px-4">
      {NAV_ITEMS.map((item) => {
        const active = item.matcher(location.pathname);
        return (
          <button
            key={item.to}
            type="button"
            className={`font-bold text-sm hover:opacity-80 ${
              active ? "text-primary" : "text-white"
            }`}
            onClick={() => navigate(item.to)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export function MainLayout() {
  return (
    <div className="flex h-screen w-screen flex-col bg-black-deep">
      <GlobalNav />
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      <Snackbar />
    </div>
  );
}
