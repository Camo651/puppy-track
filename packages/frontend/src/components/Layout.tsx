import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { usePuppy } from "@/hooks/useApi";
import { useAuth } from "@/auth/AuthContext";

const TABS = [
  { to: "/", label: "Log", icon: "🐾", end: true },
  { to: "/history", label: "History", icon: "📜" },
  { to: "/trends", label: "Trends", icon: "📈" },
  { to: "/notifications", label: "Alerts", icon: "🔔" },
];

export function Layout() {
  const { data: puppy } = usePuppy();
  const { user } = useAuth();
  const navigate = useNavigate();
  const name = puppy?.name?.trim() || "Puppy Track";

  const avatarUrl =
    user?.avatar && user?.id
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${
          user.avatar.startsWith("a_") ? "gif" : "png"
        }?size=64`
      : null;
  const initial = (user?.globalName || user?.username || "?").slice(0, 1).toUpperCase();

  return (
    <div className="app-shell mx-auto flex h-dvh w-full max-w-md flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-line/60 bg-surface/90 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate("/account")}
          className="text-lg font-bold tracking-tight"
        >
          {name}
        </button>
        <button
          onClick={() => navigate("/account")}
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-sm font-semibold"
          aria-label="Profile"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <Outlet />
      </main>

      <nav className="grid grid-cols-4 border-t border-line/60 bg-surface/95 backdrop-blur">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive ? "text-ink" : "text-muted",
              )
            }
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
