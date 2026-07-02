import { Badge } from "@/components/ui/badge";
import type { InteractionPairRiskLevel } from "@workspace/api-client-react";

/** Shared risk-level colour classes (dark-mode aware) and Ukrainian labels. */
export const riskColors: Record<InteractionPairRiskLevel, string> = {
  low: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
  medium:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
};

export const riskLabels: Record<InteractionPairRiskLevel, string> = {
  low: "Низький ризик",
  medium: "Середній ризик",
  high: "Високий ризик",
  critical: "Критичний ризик",
};

export function RiskBadge({ level }: { level: InteractionPairRiskLevel }) {
  return (
    <Badge
      variant="outline"
      className={`font-bold px-3 py-1 ${riskColors[level]}`}
      data-testid={`badge-risk-${level}`}
    >
      {riskLabels[level]}
    </Badge>
  );
}

/** A pharmacological-group / category chip. */
export function GroupBadge({ group }: { group: string }) {
  return (
    <Badge
      variant="secondary"
      className="text-xs font-medium bg-primary/10 text-primary border-primary/20"
    >
      {group}
    </Badge>
  );
}
