import React from "react";
import { Link } from "wouter";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, roleLabel } from "@/lib/auth";

export function AuthStatus({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const session = auth.session;

  if (auth.isLoading) {
    return (
      <div className="px-2 text-xs text-muted-foreground">
        Перевірка доступу...
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <Link
        href="/login"
        className={
          compact
            ? "flex min-w-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            : "flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        }
      >
        <UserRound className="w-4 h-4" />
        Увійти
      </Link>
    );
  }

  return (
    <div
      className={
        compact
          ? "min-w-0 rounded-lg border border-border bg-muted/40 p-2.5"
          : "space-y-2 rounded-xl border border-border bg-muted/40 p-3"
      }
      data-testid={compact ? "sidebar-auth-status" : "auth-status"}
    >
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
      <div
        className={
          compact ? "mt-2 flex items-center gap-2" : "flex items-center gap-2"
        }
      >
        <Badge variant="secondary">{roleLabel(session.role)}</Badge>
        {auth.isLocalBeta && <Badge variant="outline">Локальна бета</Badge>}
        {compact && session.authRequired ? (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8 shrink-0"
            aria-label="Вийти"
            title="Вийти"
            onClick={() => void auth.logout()}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      {!compact && session.authRequired ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-2"
          onClick={() => void auth.logout()}
        >
          <LogOut className="h-4 w-4" />
          Вийти
        </Button>
      ) : null}
    </div>
  );
}
