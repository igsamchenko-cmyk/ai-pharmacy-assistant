import { Link, useLocation } from "wouter";
import {
  Pill,
  GitCompare,
  Heart,
  Info,
  ClipboardCheck,
  BellRing,
  Moon,
  Sun,
} from "lucide-react";
import { ServiceWarmupStatus } from "@/components/service-warmup-status";
import { useThemeContext } from "./theme-provider";
import { AuthStatus } from "./auth-status";

export const DESKTOP_SIDEBAR_CLASS =
  "fixed inset-y-0 z-40 hidden h-[100dvh] w-64 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border bg-card md:flex";

export const DESKTOP_SIDEBAR_NAV_CLASS = "space-y-2 px-4";

export const DESKTOP_SIDEBAR_FOOTER_CLASS =
  "mt-auto flex shrink-0 flex-col gap-2 border-t border-border p-4";

export const REFERENCE_NAV_ITEMS = [
  {
    href: "/",
    activeHrefs: ["/dispense", "/search"],
    activePrefixes: ["/products", "/instructions", "/drug", "/analogs"],
    icon: ClipboardCheck,
    label: "Довідник ЛЗ",
    mobileLabel: "Довідник",
  },
  {
    href: "/interactions",
    activeHrefs: [],
    activePrefixes: [],
    icon: GitCompare,
    label: "Взаємодії",
    mobileLabel: "Взаємодії",
  },
  {
    href: "/regulatory-radar",
    activeHrefs: [],
    activePrefixes: [],
    icon: BellRing,
    label: "Заборони та оновлення",
    mobileLabel: "Заборони",
  },
  {
    href: "/favorites",
    activeHrefs: [],
    activePrefixes: [],
    icon: Heart,
    label: "Обране",
    mobileLabel: "Обране",
  },
] as const;

function isNavigationItemActive(
  location: string,
  item: (typeof REFERENCE_NAV_ITEMS)[number],
): boolean {
  return (
    location === item.href ||
    item.activeHrefs.some((href) => href === location) ||
    item.activePrefixes.some(
      (prefix) => location === prefix || location.startsWith(`${prefix}/`),
    )
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useThemeContext();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground pb-20 md:pb-0 md:flex-row">
      {/* Mobile Header */}
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
          className="ml-auto p-2 rounded-full hover:bg-accent text-muted-foreground"
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

      {/* Desktop Sidebar */}
      <aside className={DESKTOP_SIDEBAR_CLASS}>
        <div className="p-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-bold text-primary flex items-center gap-2 text-xl"
          >
            <Pill className="w-8 h-8" />
            <span>FarmAssist</span>
          </Link>
        </div>
        <nav
          className={DESKTOP_SIDEBAR_NAV_CLASS}
          aria-label="Основна навігація довідника"
        >
          {REFERENCE_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${isNavigationItemActive(location, item) ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-accent text-foreground"}`}
              data-testid={`nav-${item.href.replace("/", "") || "home"}`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={DESKTOP_SIDEBAR_FOOTER_CLASS}>
          <Link
            href="/about"
            className={`flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${location === "/about" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
          >
            <Info className="h-4 w-4" />
            Про довідник
          </Link>
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
            {theme === "dark" ? "Світла тема" : "Темна тема"}
          </button>
          <AuthStatus compact />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 w-full max-w-3xl mx-auto p-4 md:p-8 overflow-x-hidden">
        <ServiceWarmupStatus />
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around p-2 pb-[env(safe-area-inset-bottom)] shadow-lg z-50"
        aria-label="Основна навігація довідника"
      >
        {REFERENCE_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${isNavigationItemActive(location, item) ? "text-primary" : "text-muted-foreground"}`}
            data-testid={`mobile-nav-${item.href.replace("/", "") || "home"}`}
          >
            <item.icon
              className={`w-6 h-6 ${isNavigationItemActive(location, item) ? "fill-primary/20" : ""}`}
            />
            <span className="text-[10px] font-medium mt-1">
              {item.mobileLabel}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
