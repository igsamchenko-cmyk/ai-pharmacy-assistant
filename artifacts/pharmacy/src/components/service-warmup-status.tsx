import { useEffect, useState } from "react";
import {
  getHealthCheckQueryKey,
  useHealthCheck,
} from "@workspace/api-client-react";
import { LoaderCircle } from "lucide-react";

const WARMUP_STATUS_DELAY_MS = 800;

export function ServiceWarmupStatus() {
  const [showStatus, setShowStatus] = useState(false);
  const { isFetching, isPending, isSuccess } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      retry: (failureCount) => failureCount < 1,
      retryDelay: 1_000,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });
  const warming = (isPending || isFetching) && !isSuccess;

  useEffect(() => {
    if (!warming) {
      setShowStatus(false);
      return;
    }
    const timer = window.setTimeout(
      () => setShowStatus(true),
      WARMUP_STATUS_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [warming]);

  if (!showStatus || !warming) return null;
  return (
    <div
      className="mb-4 flex min-h-10 items-center gap-2 border-y py-2 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
      <span>Сервіс запускається…</span>
    </div>
  );
}
