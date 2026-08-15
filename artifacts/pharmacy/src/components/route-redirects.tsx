import { Redirect, useParams } from "wouter";
import { getGetDrugQueryKey, useGetDrug } from "@workspace/api-client-react";
import {
  favoritesAliasTarget,
  instructionAliasTarget,
  legacyDrugSearchTarget,
  searchAliasTarget,
} from "@/lib/navigation-v3";

function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

export function SearchAliasRedirect() {
  return <Redirect to={searchAliasTarget(currentSearch())} replace />;
}

export function FavoritesAliasRedirect() {
  return <Redirect to={favoritesAliasTarget(currentSearch())} replace />;
}

export function InstructionAliasRedirect() {
  const { productId = "" } = useParams<{ productId: string }>();
  return (
    <Redirect
      to={instructionAliasTarget(productId, currentSearch(), currentHash())}
      replace
    />
  );
}

export function LegacyDrugRedirect() {
  const { id = "" } = useParams<{ id: string }>();
  const drugQuery = useGetDrug(id, {
    query: {
      enabled: Boolean(id),
      queryKey: getGetDrugQueryKey(id),
      retry: false,
      refetchOnWindowFocus: false,
    },
  });

  if (drugQuery.isLoading) {
    return (
      <div
        className="mx-auto flex min-h-40 max-w-md items-center justify-center rounded-2xl border bg-card/70 p-6 text-sm text-muted-foreground"
        role="status"
      >
        Відкриваємо препарат у новому довіднику…
      </div>
    );
  }

  return (
    <Redirect to={legacyDrugSearchTarget(drugQuery.data?.brandName)} replace />
  );
}

export function RootRedirect() {
  return <Redirect to="/" replace />;
}

export function ScanRedirect() {
  return <Redirect to="/?scan=1" replace />;
}
