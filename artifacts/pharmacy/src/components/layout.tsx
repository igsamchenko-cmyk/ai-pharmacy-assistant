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
  "fixed inset-y-0 z-40 hidden h-[100dvh] w-64 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border bg-card lg:flex";

export const DESKTOP_SIDEBAR_NAV_CLASS = "space-y-2 px-4";

export const DESKTOP_SIDEBAR_FOOTER_CLASS =
  "mt-auto flex shrink-0 flex-col gap-2 border-t border-border p-4";

export const APP_CONTENT_CLASS =
  "mx-auto w-full max-w-[1600px] py-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-6 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:py-8 lg:pl-[max(2rem,env(safe-area-inset-left))] lg:pr-[max(2rem,env(safe-area-inset-right))] xl:pl-[max(2.5rem,env(safe-area-inset-left))] xl:pr-[max(2.5rem,env(safe-area-inset-right))] 2xl:pl-[max(3rem,env(safe-area-inset-left))] 2xl:pr-[max(3rem,env(safe-area-inset-right))]";

export const MOBILE_BOTTOM_NAV_CLASS =
  "fixed inset-x-0 bottom-0 z-50 grid min-h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-4 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/90 lg:hidden";

export const REFERENCE_NAV_ITEMS = [
  {
    href: "/",
    activeHrefs: ["/dispense", "/search"],
    activePrefixes: [
      "/products",
      "/instructions",
      "/drug",
      "/analogs",
      "/pharmacovigilance",
    ],
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
    <div className="flex min-h-[100dvh] min-w-0 flex-col bg-background text-foreground pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-card/95 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90 lg:hidden">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 rounded-lg font-bold text-primary"
        >
          <Pill className="w-6 h-6" />
          <span>FarmAssist</span>
        </Link>
        <button
          onClick={toggleTheme}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
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
              className={`flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 font-medium transition-colors ${isNavigationItemActive(location, item) ? "bg-primary text-primary-foreground shadow-md" : "text-foreground hover:bg-accent"}`}
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
      <main className="min-w-0 w-full flex-1 overflow-x-clip lg:pl-64">
        <div className={APP_CONTENT_CLASS} data-testid="app-content">
          <ServiceWarmupStatus />
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav
        className={MOBILE_BOTTOM_NAV_CLASS}
        aria-label="Основна навігація довідника"
      >
        {REFERENCE_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-w-0 flex-col items-center justify-center rounded-lg px-1 py-1.5 transition-colors ${isNavigationItemActive(location, item) ? "text-primary" : "text-muted-foreground"}`}
            data-testid={`mobile-nav-${item.href.replace("/", "") || "home"}`}
          >
            <item.icon
              className={`w-6 h-6 ${isNavigationItemActive(location, item) ? "fill-primary/20" : ""}`}
            />
            <span className="mt-1 max-w-full truncate text-[10px] font-medium leading-tight">
              {item.mobileLabel}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
