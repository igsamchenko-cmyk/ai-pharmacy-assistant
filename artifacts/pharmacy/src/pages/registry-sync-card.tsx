import { Database, ShieldCheck } from "lucide-react";
import type { BetaDashboardStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";

function value(value: number | null): string | number {
  return value === null ? "—" : value;
}

function statusLabel(
  status: BetaDashboardStatus["registrySync"]["parityStatus"],
) {
  if (status === "exact") return "Exact parity";
  if (status === "mismatch") return "Mismatch";
  return "Очікує DB audit";
}

export function RegistrySyncCard({ status }: { status: BetaDashboardStatus }) {
  const sync = status.registrySync;
  const exact = sync.parityStatus === "exact";
  return (
    <Card className="bg-card/50" data-testid="registry-sync-status">
      <CardContent className="p-5 space-y-4 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Синхронізація з ДРЛЗ
            </h2>
            <p className="text-sm text-muted-foreground">
              Остання синхронізація:{" "}
              {sync.lastSyncedAt
                ? new Date(sync.lastSyncedAt).toLocaleString("uk-UA")
                : "немає підтвердженого запуску"}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              exact
                ? "text-emerald-700 bg-emerald-500/10"
                : "text-amber-700 bg-amber-500/10"
            }`}
          >
            <ShieldCheck className="inline w-3.5 h-3.5 mr-1" />
            {statusLabel(sync.parityStatus)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Official rows", sync.officialRows],
            ["FarmAssist rows", sync.farmAssistRows],
            ["Missing", value(sync.missingCount)],
            ["Extra", value(sync.extraCount)],
            ["Changed", value(sync.changedCount)],
            ["Parity", statusLabel(sync.parityStatus)],
          ].map(([label, count]) => (
            <div
              key={label}
              className="bg-muted/50 rounded-lg p-3 text-center min-w-0"
            >
              <div className="font-bold text-foreground break-words">
                {count}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground break-all">
          Source SHA-256:{" "}
          <span className="font-mono">{sync.sourceHash ?? "—"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
