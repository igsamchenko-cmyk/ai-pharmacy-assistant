import { Link, useLocation } from "wouter";
import { Home, Search, Pill, GitCompare, Sparkles, Scan, Clock, Info, Moon, Sun } from "lucide-react";
import { useThemeContext } from "./theme-provider";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useThemeContext();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const navItems = [
    { href: "/", icon: Home, label: "Головна" },
    { href: "/search", icon: Search, label: "Пошук" },
    { href: "/interactions", icon: GitCompare, label: "Взаємодії" },
    { href: "/ai", icon: Sparkles, label: "AI" },
    { href: "/scan", icon: Scan, label: "Скан" },
    { href: "/history", icon: Clock, label: "Історія" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground pb-20 md:pb-0 md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-40 bg-card border-b border-border p-4 flex justify-between items-center shadow-sm">
        <Link href="/" className="font-bold text-primary flex items-center gap-2">
          <Pill className="w-6 h-6" />
          <span>FarmAssist</span>
        </Link>
        <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-accent text-muted-foreground" data-testid="button-theme-toggle">
          {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border shrink-0 fixed h-full z-40">
        <div className="p-6 flex items-center justify-between">
          <Link href="/" className="font-bold text-primary flex items-center gap-2 text-xl">
            <Pill className="w-8 h-8" />
            <span>FarmAssist</span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${location === item.href ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-accent text-foreground'}`} data-testid={`nav-${item.href.replace('/', '') || 'home'}`}>
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-border flex flex-col gap-2">
          <Link href="/about" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${location === '/about' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground'}`}>
            <Info className="w-5 h-5" />
            Про сервіс
          </Link>
          <button onClick={toggleTheme} className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium hover:bg-accent text-foreground text-left w-full">
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === "dark" ? "Світла тема" : "Темна тема"}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 w-full max-w-3xl mx-auto p-4 md:p-8 overflow-x-hidden">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around p-2 pb-[env(safe-area-inset-bottom)] shadow-lg z-50">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${location === item.href ? 'text-primary' : 'text-muted-foreground'}`} data-testid={`mobile-nav-${item.href.replace('/', '') || 'home'}`}>
            <item.icon className={`w-6 h-6 ${location === item.href ? 'fill-primary/20' : ''}`} />
            <span className="text-[10px] font-medium mt-1">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
