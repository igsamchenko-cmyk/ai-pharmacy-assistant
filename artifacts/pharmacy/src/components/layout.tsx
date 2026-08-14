import React from "react";
import { Link, useLocation } from "wouter";
import { Bookmark, GitCompare, Moon, Pill, Search, Sun } from "lucide-react";
import { ServiceWarmupStatus } from "@/components/service-warmup-status";
import { useThemeContext } from "./theme-provider";
import { AuthStatus } from "./auth-status";

export const DESKTOP_HEADER_CLASS =
  "sticky top-0 z-50 hidden min-h-16 border-b border-border bg-card/95 px-[max(1.5rem,env(safe-area-inset-left))] shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90 md:flex";

export const APP_CONTENT_CLASS =
  "mx-auto w-full max-w-[1600px] py-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-6 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:py-8 lg:pl-[max(2rem,env(safe-area-inset-left))] lg:pr-[max(2rem,env(safe-area-inset-right))] xl:pl-[max(2.5rem,env(safe-area-inset-left))] xl:pr-[max(2.5rem,env(safe-area-inset-right))] 2xl:pl-[max(3rem,env(safe-area-inset-left))] 2xl:pr-[max(3rem,env(safe-area-inset-right))]";

export const MOBILE_BOTTOM_NAV_CLASS =
  "fixed inset-x-0 bottom-0 z-50 grid min-h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-3 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/90 md:hidden";

export const REFERENCE_NAV_ITEMS = [
  {
    href: "/",
    activeHrefs: ["/search"],
    activePrefixes: ["/products", "/instructions", "/drug", "/analogs"],
    icon: Search,
    label: "Пошук",
    mobileLabel: "Пошук",
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
    href: "/history",
    activeHrefs: ["/favorites"],
    activePrefixes: [],
    icon: Bookmark,
    label: "Збережене",
    mobileLabel: "Збережене",
  },
] as const;

export function isNavigationItemActive(
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

function PrimaryNavigation({ mobile = false }: { mobile?: boolean }) {
  const [location] = useLocation();
  return (
    <nav
      className={mobile ? MOBILE_BOTTOM_NAV_CLASS : "flex items-center gap-1"}
      aria-label="Основна навігація довідника"
      data-testid={
        mobile ? "mobile-primary-navigation" : "desktop-primary-navigation"
      }
    >
      {REFERENCE_NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            mobile
              ? `flex min-w-0 flex-col items-center justify-center rounded-lg px-1 py-1.5 transition-colors ${isNavigationItemActive(location, item) ? "text-primary" : "text-muted-foreground"}`
              : `flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 font-medium transition-colors ${isNavigationItemActive(location, item) ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-accent"}`
          }
          data-testid={`${mobile ? "mobile-" : ""}nav-${item.href.replace("/", "") || "home"}`}
        >
          <item.icon className={mobile ? "h-6 w-6" : "h-5 w-5"} />
          <span
            className={
              mobile
                ? "mt-1 max-w-full truncate text-[10px] font-medium leading-tight"
                : ""
            }
          >
            {mobile ? item.mobileLabel : item.label}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useThemeContext();
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col bg-background text-foreground pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-40 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-card/95 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90 md:hidden">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 rounded-lg font-bold text-primary"
        >
          <Pill className="h-6 w-6" />
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
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>
      </header>

      <header className={DESKTOP_HEADER_CLASS}>
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-6">
          <Link
            href="/"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg text-xl font-bold text-primary"
          >
            <Pill className="h-7 w-7" />
            <span>FarmAssist</span>
          </Link>
          <PrimaryNavigation />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
              aria-label={
                theme === "dark"
                  ? "Увімкнути світлу тему"
                  : "Увімкнути темну тему"
              }
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
            <AuthStatus compact />
          </div>
        </div>
      </header>

      <main className="min-w-0 w-full flex-1 overflow-x-clip">
        <div className={APP_CONTENT_CLASS} data-testid="app-content">
          <ServiceWarmupStatus />
          {children}
        </div>
      </main>

      <PrimaryNavigation mobile />
    </div>
  );
}
