import React from "react";
import { BellRing, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useRegulatoryRadarRefresh } from "@/lib/regulatory-radar-refresh";
import {
  hasUnseenRegSnapshot,
  markRegSnapshotSeen,
  readLastSeenRegSnapshot,
  regulatorySnapshotVersion,
} from "@/lib/regulatory-snapshot-seen";

export function RegulatoryUpdateBanner() {
  const { lastResult } = useRegulatoryRadarRefresh();
  const version = regulatorySnapshotVersion(lastResult);
  const [lastSeen, setLastSeen] = useState(readLastSeenRegSnapshot);

  useEffect(() => {
    const onStorage = () => setLastSeen(readLastSeenRegSnapshot());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!hasUnseenRegSnapshot(version, lastSeen) || !lastResult) return null;
  const markSeen = () => {
    if (!version) return;
    markRegSnapshotSeen(version);
    setLastSeen(version);
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center"
      data-testid="regulatory-update-banner"
      aria-label="Нові розпорядження Держлікслужби"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0">
          <h2 className="font-bold">Нові розпорядження Держлікслужби</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Перевірений знімок: {lastResult.recordCount.toLocaleString("uk-UA")}{" "}
            записів
            {lastResult.latestDocumentDate
              ? ` · останній документ ${lastResult.latestDocumentDate}`
              : ""}
            .
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild className="min-h-11 flex-1 sm:flex-none">
          <Link href="/regulatory-radar" onClick={markSeen}>
            Переглянути
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-11 w-11 shrink-0"
          onClick={markSeen}
          aria-label="Закрити повідомлення про оновлення"
          data-testid="dismiss-regulatory-update"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
