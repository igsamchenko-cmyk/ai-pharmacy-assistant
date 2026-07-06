import type { ComponentType } from "react";
import type { AuthRole } from "@workspace/api-client-react";
import { useAuth, roleLabel } from "@/lib/auth";
import AccessDenied from "@/pages/access-denied";
import { Skeleton } from "@/components/ui/skeleton";

export function ProtectedRoute({
  component: Component,
  minRole = "user",
}: {
  component: ComponentType;
  minRole?: Exclude<AuthRole, "none">;
}) {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <AccessDenied
        title="Потрібен вхід"
        message="Цей розділ доступний лише учасникам приватної бети."
        actionHref="/login"
        actionLabel="Увійти"
      />
    );
  }

  if (!auth.hasRole(minRole)) {
    return (
      <AccessDenied
        title="Недостатньо прав"
        message={`Потрібна роль: ${roleLabel(minRole)}.`}
        actionHref="/search"
        actionLabel="До пошуку"
      />
    );
  }

  return <Component />;
}
