import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  GitCompare,
  Play,
  RefreshCcw,
  SearchCheck,
  ServerCog,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GlobalDisclaimer } from "@/components/disclaimer";
import {
  useGetBetaDashboardStatus,
  useRunBetaDashboardCheck,
} from "@workspace/api-client-react";
import type {
  BetaDashboardCheckType,
  BetaDashboardRunResponse,
  BetaDashboardStatus,
} from "@workspace/api-client-react";

type RunnableCheck = Exclude<BetaDashboardCheckType, "full_safe_check">;
type RunMap = Partial<Record<BetaDashboardCheckType, BetaDashboardRunResponse>>;
type IconComponent = typeof Activity;

const UI = {
  checks: {
    readiness: "\u0413\u043e\u0442\u043e\u0432\u043d\u0456\u0441\u0442\u044c beta",
    scenarios: "\u0421\u0446\u0435\u043d\u0430\u0440\u0456\u0457",
    search_quality: "\u042f\u043a\u0456\u0441\u0442\u044c \u043f\u043e\u0448\u0443\u043a\u0443",
    real_world: "Real-world pharmacy",
    ingestion: "Automated ingestion",
    safety: "\u041f\u0435\u0440\u0435\u0432\u0456\u0440\u043a\u0438 \u0431\u0435\u0437\u043f\u0435\u043a\u0438",
    interactions: "\u0412\u0437\u0430\u0454\u043c\u043e\u0434\u0456\u0457",
    data_quality: "\u042f\u043a\u0456\u0441\u0442\u044c \u0434\u0430\u043d\u0438\u0445",
    diagnostics: "\u0414\u0456\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u043a\u0430 runtime",
    full_safe_check: "\u041f\u043e\u0432\u043d\u0430 \u0431\u0435\u0437\u043f\u0435\u0447\u043d\u0430 \u043f\u0435\u0440\u0435\u0432\u0456\u0440\u043a\u0430",
  },
  buttons: {
    readiness: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0438 \u0433\u043e\u0442\u043e\u0432\u043d\u0456\u0441\u0442\u044c",
    scenarios: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0438 \u0441\u0446\u0435\u043d\u0430\u0440\u0456\u0457",
    search_quality: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0438 \u0437\u0432\u0456\u0442",
    real_world: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438 real-world",
    ingestion: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438 ingestion",
    safety: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0438 \u0431\u0435\u0437\u043f\u0435\u043a\u0443",
    interactions: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0438 \u0432\u0437\u0430\u0454\u043c\u043e\u0434\u0456\u0457",
    data_quality: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0438 \u044f\u043a\u0456\u0441\u0442\u044c",
    diagnostics: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0438 \u0434\u0456\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u043a\u0443",
    full_safe_check: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0438 \u043f\u043e\u0432\u043d\u0443",
    refresh: "\u041e\u043d\u043e\u0432\u0438\u0442\u0438",
    exportJson: "\u0415\u043a\u0441\u043f\u043e\u0440\u0442 JSON",
    openQuality: "\u0412\u0456\u0434\u043a\u0440\u0438\u0442\u0438 \u044f\u043a\u0456\u0441\u0442\u044c",
    openReview: "\u0412\u0456\u0434\u043a\u0440\u0438\u0442\u0438 review",
  },
  status: {
    warning: "\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u0436\u0435\u043d\u043d\u044f",
    failed: "\u041f\u043e\u043c\u0438\u043b\u043a\u0430",
    running: "\u0412\u0438\u043a\u043e\u043d\u0443\u0454\u0442\u044c\u0441\u044f",
    yes: "\u0442\u0430\u043a",
    no: "\u043d\u0456",
  },
  labels: {
    readinessTitle: "\u041e\u0446\u0456\u043d\u043a\u0430 \u0433\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u0456",
    score: "\u041e\u0446\u0456\u043d\u043a\u0430",
    closedBeta: "\u0417\u0430\u043a\u0440\u0438\u0442\u0430 beta",
    ready: "\u0413\u043e\u0442\u043e\u0432\u043e",
    review: "\u041f\u0435\u0440\u0435\u0433\u043b\u044f\u0434",
    passed: "\u041f\u0440\u043e\u0439\u0434\u0435\u043d\u043e",
    failed: "\u041f\u043e\u043c\u0438\u043b\u043a\u0438",
    total: "\u0423\u0441\u044c\u043e\u0433\u043e",
    queries: "\u0417\u0430\u043f\u0438\u0442\u0438",
    hitRate: "\u0417\u0431\u0456\u0433\u0438",
    topResult: "\u0422\u043e\u043f \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442",
    misses: "\u041f\u0440\u043e\u043f\u0443\u0441\u043a\u0438",
    recommended: "\u0420\u0435\u043a\u043e\u043c. \u0434\u043e\u0434\u0430\u0442\u0438",
    candidateFiles: "Candidate files",
    candidateRows: "Candidate rows",
    needsReview: "\u041d\u0430 review",
    approvedSources: "\u0414\u0436\u0435\u0440\u0435\u043b\u0430 OK",
    runtimeMode: "\u0420\u0435\u0436\u0438\u043c runtime",
    mode: "\u0420\u0435\u0436\u0438\u043c",
    dbConfigured: "DB \u043d\u0430\u043b\u0430\u0448\u0442.",
    dbAvailable: "DB \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430",
    mappings: "\u041c\u0430\u043f\u0456\u043d\u0433\u0438",
    sources: "\u0414\u0436\u0435\u0440\u0435\u043b\u0430",
    conflicts: "\u041a\u043e\u043d\u0444\u043b\u0456\u043a\u0442\u0438",
    reviewQueue: "\u0427\u0435\u0440\u0433\u0430 review",
    pending: "\u041e\u0447\u0456\u043a\u0443\u0454",
    approved: "\u041f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043e",
    rejected: "\u0412\u0456\u0434\u0445\u0438\u043b\u0435\u043d\u043e",
    release: "\u0420\u0435\u043b\u0456\u0437",
    version: "\u0412\u0435\u0440\u0441\u0456\u044f",
    overallStatus: "\u0421\u0442\u0430\u0442\u0443\u0441",
    availableChecks: "\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u0456 \u043f\u0435\u0440\u0435\u0432\u0456\u0440\u043a\u0438",
  },
  messages: {
    intro: "\u041f\u0430\u043d\u0435\u043b\u044c \u0442\u0435\u0441\u0442\u0443\u0432\u0430\u043d\u043d\u044f \u0437\u0430\u043a\u0440\u0438\u0442\u043e\u0457 beta: \u0431\u0435\u0437\u043f\u0435\u0447\u043d\u0456 \u043f\u0435\u0440\u0435\u0432\u0456\u0440\u043a\u0438 \u0431\u0435\u0437 shell-\u043a\u043e\u043c\u0430\u043d\u0434.",
    loading: "\u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f beta dashboard...",
    statusError: "Beta Dashboard \u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0439. \u041f\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 API \u0441\u0435\u0440\u0432\u0435\u0440 \u0456 \u043f\u043e\u0432\u0442\u043e\u0440\u0456\u0442\u044c \u043e\u043d\u043e\u0432\u043b\u0435\u043d\u043d\u044f.",
    runError: "\u041f\u0435\u0440\u0435\u0432\u0456\u0440\u043a\u0443 \u043d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0432\u0438\u043a\u043e\u043d\u0430\u0442\u0438. \u0414\u0435\u0442\u0430\u043b\u0456 \u043f\u0440\u0438\u0445\u043e\u0432\u0430\u043d\u043e, \u0449\u043e\u0431 \u043d\u0435 \u043f\u043e\u043a\u0430\u0437\u0443\u0432\u0430\u0442\u0438 stack trace \u0443 UI.",
    extraWarnings: "\u0434\u043e\u0434\u0430\u0442\u043a\u043e\u0432\u0438\u0445 \u043f\u043e\u043f\u0435\u0440\u0435\u0434\u0436\u0435\u043d\u044c",
  },
} as const;

const CHECK_LABEL: Record<BetaDashboardCheckType, string> = UI.checks;
const RUNNABLE_CHECKS: { type: RunnableCheck; button: string }[] = [
  { type: "readiness", button: UI.buttons.readiness },
  { type: "scenarios", button: UI.buttons.scenarios },
  { type: "search_quality", button: UI.buttons.search_quality },
  { type: "real_world", button: UI.buttons.real_world },
  { type: "ingestion", button: UI.buttons.ingestion },
  { type: "safety", button: UI.buttons.safety },
  { type: "interactions", button: UI.buttons.interactions },
  { type: "data_quality", button: UI.buttons.data_quality },
  { type: "diagnostics", button: UI.buttons.diagnostics },
];

function statusLabel(status: string): string {
  if (status === "ok") return "OK";
  if (status === "warning") return UI.status.warning;
  return UI.status.failed;
}

function statusClass(status: string): string {
  if (status === "ok") return "text-emerald-700 bg-emerald-500/10";
  if (status === "warning") return "text-amber-700 bg-amber-500/10";
  return "text-destructive bg-destructive/10";
}

function boolLabel(value: boolean): string {
  return value ? UI.status.yes : UI.status.no;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/50 rounded-lg p-4 text-center min-w-0">
      <div className="text-2xl font-bold text-foreground truncate">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function WarningBlock({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 space-y-1">
      {warnings.slice(0, 4).map((warning) => (
        <div key={warning}>{warning}</div>
      ))}
      {warnings.length > 4 && <div>+{warnings.length - 4} {UI.messages.extraWarnings}</div>}
    </div>
  );
}

function LastRun({ result }: { result?: BetaDashboardRunResponse }) {
  if (!result) return null;
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(result.status)}`}>
          {statusLabel(result.status)}
        </span>
        <span className="text-muted-foreground">{result.durationMs} ms</span>
      </div>
      <p className="text-foreground">{result.summary}</p>
      <WarningBlock warnings={result.warnings} />
    </div>
  );
}

function RunButton({
  checkType,
  onRun,
  running,
  label,
}: {
  checkType: BetaDashboardCheckType;
  onRun: (checkType: BetaDashboardCheckType) => void;
  running: boolean;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => onRun(checkType)}
      disabled={running}
      className="gap-1.5"
    >
      {running ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
      {running ? UI.status.running : label}
    </Button>
  );
}

function PanelCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: IconComponent;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            {title}
          </h3>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function DashboardContent({
  status,
  lastRuns,
  runningType,
  onRun,
}: {
  status: BetaDashboardStatus;
  lastRuns: RunMap;
  runningType: BetaDashboardCheckType | null;
  onRun: (checkType: BetaDashboardCheckType) => void;
}) {
  return (
    <div className="space-y-4">
      <PanelCard
        title={UI.labels.readinessTitle}
        icon={CheckCircle2}
        action={
          <RunButton
            checkType="readiness"
            onRun={onRun}
            running={runningType === "readiness"}
            label={UI.buttons.readiness}
          />
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <StatCard label={UI.labels.score} value={status.readiness.score} />
          <StatCard label={UI.labels.closedBeta} value={status.readiness.ready ? UI.labels.ready : UI.labels.review} />
        </div>
        <p className="text-sm text-muted-foreground">{status.readiness.summary}</p>
        <WarningBlock warnings={status.readiness.warnings} />
        <LastRun result={lastRuns.readiness} />
      </PanelCard>

      <PanelCard
        title={UI.checks.scenarios}
        icon={Activity}
        action={
          <RunButton
            checkType="scenarios"
            onRun={onRun}
            running={runningType === "scenarios"}
            label={UI.buttons.scenarios}
          />
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <StatCard label={UI.labels.passed} value={status.scenarios.passed} />
          <StatCard label={UI.labels.failed} value={status.scenarios.failed} />
          <StatCard label={UI.labels.total} value={status.scenarios.total} />
        </div>
        <LastRun result={lastRuns.scenarios} />
      </PanelCard>

      <PanelCard
        title={UI.checks.search_quality}
        icon={SearchCheck}
        action={
          <RunButton
            checkType="search_quality"
            onRun={onRun}
            running={runningType === "search_quality"}
            label={UI.buttons.search_quality}
          />
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={UI.labels.queries} value={status.searchQuality.totalQueries} />
          <StatCard label={UI.labels.hitRate} value={`${status.searchQuality.hitRatePct}%`} />
          <StatCard label={UI.labels.topResult} value={`${status.searchQuality.topResultAccuracyPct}%`} />
          <StatCard label={UI.labels.misses} value={status.searchQuality.missesCount} />
        </div>
        <WarningBlock warnings={status.searchQuality.warnings} />
        <LastRun result={lastRuns.search_quality} />
      </PanelCard>

      <PanelCard
        title={UI.checks.real_world}
        icon={SearchCheck}
        action={
          <RunButton
            checkType="real_world"
            onRun={onRun}
            running={runningType === "real_world"}
            label={UI.buttons.real_world}
          />
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={UI.labels.total} value={status.realWorld.total} />
          <StatCard label={UI.labels.passed} value={status.realWorld.passed} />
          <StatCard label={UI.labels.misses} value={status.realWorld.missed} />
          <StatCard label={UI.labels.recommended} value={status.realWorld.recommendedAdditions} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard label={UI.labels.hitRate} value={`${status.realWorld.hitRatePct}%`} />
        </div>
        <WarningBlock warnings={status.realWorld.warnings} />
        <LastRun result={lastRuns.real_world} />
      </PanelCard>

      <PanelCard
        title={UI.checks.ingestion}
        icon={Upload}
        action={
          <RunButton
            checkType="ingestion"
            onRun={onRun}
            running={runningType === "ingestion"}
            label={UI.buttons.ingestion}
          />
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={UI.labels.approvedSources} value={status.ingestion.sourcesApproved} />
          <StatCard label={UI.labels.candidateFiles} value={status.ingestion.candidateFiles} />
          <StatCard label={UI.labels.candidateRows} value={status.ingestion.candidateRows} />
          <StatCard label={UI.labels.conflicts} value={status.ingestion.conflicts} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={UI.labels.approved} value={status.ingestion.approved} />
          <StatCard label={UI.labels.pending} value={status.ingestion.pending} />
          <StatCard label={UI.labels.needsReview} value={status.ingestion.needsReview} />
          <StatCard label={UI.labels.rejected} value={status.ingestion.rejected} />
        </div>
        <WarningBlock warnings={status.ingestion.warnings} />
        <LastRun result={lastRuns.ingestion} />
      </PanelCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title={UI.checks.safety}
          icon={ShieldCheck}
          action={
            <RunButton
              checkType="safety"
              onRun={onRun}
              running={runningType === "safety"}
              label={UI.buttons.safety}
            />
          }
        >
          <LastRun result={lastRuns.safety} />
        </PanelCard>

        <PanelCard
          title={UI.checks.interactions}
          icon={GitCompare}
          action={
            <RunButton
              checkType="interactions"
              onRun={onRun}
              running={runningType === "interactions"}
              label={UI.buttons.interactions}
            />
          }
        >
          <LastRun result={lastRuns.interactions} />
        </PanelCard>
      </div>

      <PanelCard
        title={UI.labels.runtimeMode}
        icon={ServerCog}
        action={
          <RunButton
            checkType="diagnostics"
            onRun={onRun}
            running={runningType === "diagnostics"}
            label={UI.buttons.diagnostics}
          />
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={UI.labels.mode} value={status.runtime.mode} />
          <StatCard label={UI.labels.dbConfigured} value={boolLabel(status.runtime.dbConfigured)} />
          <StatCard label={UI.labels.dbAvailable} value={boolLabel(status.runtime.dbAvailable)} />
          <StatCard label="Fallback" value={boolLabel(status.runtime.staticFallbackEnabled)} />
        </div>
        <WarningBlock warnings={status.runtime.warnings} />
        <LastRun result={lastRuns.diagnostics} />
      </PanelCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title={UI.checks.data_quality}
          icon={Database}
          action={
            <Button size="sm" variant="outline" asChild>
              <Link href="/data-quality">{UI.buttons.openQuality}</Link>
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={UI.labels.mappings} value={status.dataQuality.mappingsCount} />
            <StatCard label={UI.labels.sources} value={`${status.dataQuality.sourceCoveragePct}%`} />
            <StatCard label="ATC" value={`${status.dataQuality.atcCoveragePct}%`} />
            <StatCard label={UI.labels.conflicts} value={status.dataQuality.conflicts} />
          </div>
          <RunButton
            checkType="data_quality"
            onRun={onRun}
            running={runningType === "data_quality"}
            label={UI.buttons.data_quality}
          />
          <LastRun result={lastRuns.data_quality} />
        </PanelCard>

        <PanelCard
          title={UI.labels.reviewQueue}
          icon={ClipboardList}
          action={
            <Button size="sm" variant="outline" asChild>
              <Link href="/review">{UI.buttons.openReview}</Link>
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={UI.labels.pending} value={status.reviewQueue.pending} />
            <StatCard label={UI.labels.needsReview} value={status.reviewQueue.needsReview} />
            <StatCard label={UI.labels.approved} value={status.reviewQueue.approved} />
            <StatCard label={UI.labels.rejected} value={status.reviewQueue.rejected} />
          </div>
          <WarningBlock warnings={status.reviewQueue.warnings} />
        </PanelCard>
      </div>
    </div>
  );
}

export default function BetaDashboard() {
  const statusQuery = useGetBetaDashboardStatus();
  const [lastRuns, setLastRuns] = useState<RunMap>({});
  const [runningType, setRunningType] = useState<BetaDashboardCheckType | null>(null);
  const mutation = useRunBetaDashboardCheck({
    mutation: {
      onSuccess: (result) => {
        setLastRuns((current) => ({ ...current, [result.checkType]: result }));
        setRunningType(null);
      },
      onError: () => {
        setRunningType(null);
      },
    },
  });

  const exportPayload = useMemo(
    () => ({
      exportedAt: new Date().toISOString(),
      status: statusQuery.data ?? null,
      lastRuns,
    }),
    [lastRuns, statusQuery.data],
  );

  function runCheck(checkType: BetaDashboardCheckType) {
    setRunningType(checkType);
    mutation.mutate({ data: { checkType } });
  }

  function exportReport() {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beta-dashboard-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Beta Dashboard</h1>
            <p className="text-sm text-muted-foreground">{UI.messages.intro}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void statusQuery.refetch()}
              disabled={statusQuery.isFetching}
              className="gap-1.5"
            >
              <RefreshCcw className={`w-4 h-4 ${statusQuery.isFetching ? "animate-spin" : ""}`} />
              {UI.buttons.refresh}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportReport}
              disabled={!statusQuery.data}
              className="gap-1.5"
            >
              <Download className="w-4 h-4" />
              {UI.buttons.exportJson}
            </Button>
          </div>
        </div>
      </div>

      <GlobalDisclaimer />

      <Card className="bg-card/50 border-l-4 border-l-primary">
        <CardContent className="p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Activity className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-foreground">{UI.checks.full_safe_check}</h2>
            </div>
          </div>
          <RunButton
            checkType="full_safe_check"
            onRun={runCheck}
            running={runningType === "full_safe_check"}
            label={UI.buttons.full_safe_check}
          />
        </CardContent>
      </Card>
      <LastRun result={lastRuns.full_safe_check} />

      {statusQuery.isLoading && (
        <Card className="bg-card/50">
          <CardContent className="p-5 text-sm text-muted-foreground">
            {UI.messages.loading}
          </CardContent>
        </Card>
      )}

      {statusQuery.isError && (
        <Card className="bg-card/50 border-destructive/30">
          <CardContent className="p-5 flex items-start gap-3 text-sm text-destructive">
            <XCircle className="w-5 h-5 shrink-0" />
            {UI.messages.statusError}
          </CardContent>
        </Card>
      )}

      {mutation.isError && (
        <Card className="bg-card/50 border-amber-500/30">
          <CardContent className="p-5 flex items-start gap-3 text-sm text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {UI.messages.runError}
          </CardContent>
        </Card>
      )}

      {statusQuery.data && (
        <>
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            {UI.labels.release}: {statusQuery.data.diagnostics.releaseLabel} | {UI.labels.version}: {statusQuery.data.diagnostics.version} | {UI.labels.overallStatus}:{" "}
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(statusQuery.data.status)}`}>
              {statusLabel(statusQuery.data.status)}
            </span>
          </div>
          <DashboardContent
            status={statusQuery.data}
            lastRuns={lastRuns}
            runningType={runningType}
            onRun={runCheck}
          />
        </>
      )}

      <Card className="bg-card/50">
        <CardContent className="p-5 space-y-3">
          <h3 className="font-bold text-foreground">{UI.labels.availableChecks}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {RUNNABLE_CHECKS.map((check) => (
              <div key={check.type} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm text-foreground">{CHECK_LABEL[check.type]}</span>
                <RunButton
                  checkType={check.type}
                  onRun={runCheck}
                  running={runningType === check.type}
                  label={check.button}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
