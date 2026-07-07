import { Link, useLocation } from "wouter";
import {
  Home,
  Search,
  Pill,
  GitCompare,
  Columns3,
  Stethoscope,
  Info,
  Database,
  ClipboardList,
  FlaskConical,
  Moon,
  Sun,
} from "lucide-react";
import { useThemeContext } from "./theme-provider";
import { AuthStatus } from "./auth-status";
import { useAuth } from "@/lib/auth";
import { visibleNavItems, type OnlineRouteId } from "@/lib/online-dashboard";

const NAV_ICONS: Record<OnlineRouteId, typeof Home> = {
  home: Home,
  search: Search,
  interactions: GitCompare,
  compare: Columns3,
  hospital: Stethoscope,
  "beta-dashboard": FlaskConical,
  "data-quality": Database,
  review: ClipboardList,
  about: Info,
};

function NavLink({
  href,
  icon: Icon,
  label,
  location,
  mobile = false,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  location: string;
  mobile?: boolean;
}) {
  const active = location === href;
  if (mobile) {
    return (
      <Link
        href={href}
        className={`flex flex-col items-center p-2 rounded-lg transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
        data-testid={`mobile-nav-${href.replace("/", "") || "home"}`}
      >
        <Icon className={`w-6 h-6 ${active ? "fill-primary/20" : ""}`} />
        <span className="text-[10px] font-medium mt-1 leading-tight text-center">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${active ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-accent text-foreground"}`}
      data-testid={`nav-${href.replace("/", "") || "home"}`}
    >
      <Icon className="w-5 h-5" />
      {label}
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useThemeContext();
  const auth = useAuth();
  const role = auth.session?.role;
  const navItems = visibleNavItems(role);
  const mobileNavItems = navItems.filter((item) => item.id !== "home" && item.id !== "about").slice(0, 7);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground pb-20 md:pb-0 md:flex-row">
      <header className="md:hidden sticky top-0 z-40 bg-card border-b border-border p-4 flex justify-between items-center shadow-sm">
        <Link
          href="/"
          className="font-bold text-primary flex items-center gap-2"
        >
          <Pill className="w-6 h-6" />
          <span>FarmAssist</span>
        </Link>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-accent text-muted-foreground"
          data-testid="button-theme-toggle"
          aria-label={
            theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему"
          }
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>
      </header>
      <div className="md:hidden border-b border-border bg-card px-4 py-3">
        <AuthStatus />
      </div>

      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border shrink-0 fixed h-full z-40">
        <div className="p-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-bold text-primary flex items-center gap-2 text-xl"
          >
            <Pill className="w-8 h-8" />
            <span>FarmAssist</span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={NAV_ICONS[item.id]}
              label={item.label}
              location={location}
            />
          ))}
        </nav>
        <div className="p-4 border-t border-border flex flex-col gap-2">
          <AuthStatus />
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium hover:bg-accent text-foreground text-left w-full"
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
            {theme === "dark" ? "Світла тема" : "Темна тема"}
          </button>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 w-full max-w-3xl mx-auto p-4 md:p-8 overflow-x-hidden">
        {children}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around p-2 pb-[env(safe-area-inset-bottom)] shadow-lg z-50">
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={NAV_ICONS[item.id]}
            label={item.label}
            location={location}
            mobile
          />
        ))}
      </nav>
    </div>
  );
}
