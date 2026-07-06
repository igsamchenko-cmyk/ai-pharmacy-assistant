import { Link } from "wouter";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, roleLabel } from "@/lib/auth";

export function AuthStatus() {
  const auth = useAuth();
  const session = auth.session;

  if (auth.isLoading) {
    return <div className="text-xs text-muted-foreground px-2">Перевірка доступу...</div>;
  }

  if (!session?.authenticated) {
    return (
      <Link
        href="/login"
        className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
      >
        <UserRound className="w-4 h-4" />
        Увійти
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {session.user?.name ?? session.user?.email}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {session.user?.email}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{roleLabel(session.role)}</Badge>
        {auth.isLocalBeta && <Badge variant="outline">Локальна бета</Badge>}
      </div>
      {session.authRequired && (
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-2"
          onClick={() => void auth.logout()}
        >
          <LogOut className="w-4 h-4" />
          Вийти
        </Button>
      )}
    </div>
  );
}
