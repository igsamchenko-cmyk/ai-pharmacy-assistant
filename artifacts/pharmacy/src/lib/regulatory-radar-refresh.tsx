import {
  getGetRegulatoryRadarQueryKey,
  useRefreshRegulatoryRadar,
  type RegulatoryRadarRefresh,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";

interface RegulatoryRadarRefreshContextValue {
  isRefreshing: boolean;
  lastResult: RegulatoryRadarRefresh | null;
  refresh(): Promise<RegulatoryRadarRefresh | null>;
}

const RegulatoryRadarRefreshContext =
  createContext<RegulatoryRadarRefreshContextValue | null>(null);

export function RegulatoryRadarRefreshProvider({
  children,
}: {
  children: ReactNode;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const attemptedIdentity = useRef<string | null>(null);
  const [lastResult, setLastResult] = useState<RegulatoryRadarRefresh | null>(
    null,
  );
  const { mutateAsync, isPending } = useRefreshRegulatoryRadar();

  const refresh = useCallback(async () => {
    try {
      const result = await mutateAsync();
      setLastResult(result);
      if (result.status === "updated" || result.status === "unchanged") {
        await queryClient.invalidateQueries({
          queryKey: getGetRegulatoryRadarQueryKey(),
        });
      }
      return result;
    } catch {
      return null;
    }
  }, [mutateAsync, queryClient]);

  useEffect(() => {
    if (!auth.canUseReference) {
      attemptedIdentity.current = null;
      setLastResult(null);
      return;
    }
    const identity = auth.session?.user?.email ?? "public-reference";
    if (attemptedIdentity.current === identity) return;
    attemptedIdentity.current = identity;
    void refresh();
  }, [auth.canUseReference, auth.session?.user?.email, refresh]);

  const value = useMemo<RegulatoryRadarRefreshContextValue>(
    () => ({
      isRefreshing: isPending,
      lastResult,
      refresh,
    }),
    [isPending, lastResult, refresh],
  );

  return (
    <RegulatoryRadarRefreshContext.Provider value={value}>
      {children}
    </RegulatoryRadarRefreshContext.Provider>
  );
}

export function useRegulatoryRadarRefresh(): RegulatoryRadarRefreshContextValue {
  const value = useContext(RegulatoryRadarRefreshContext);
  if (!value) {
    throw new Error(
      "useRegulatoryRadarRefresh must be used within RegulatoryRadarRefreshProvider",
    );
  }
  return value;
}
