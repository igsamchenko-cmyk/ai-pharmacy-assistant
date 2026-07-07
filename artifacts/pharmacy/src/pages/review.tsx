import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Filter,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { useToast } from "@/hooks/use-toast";
import {
  useApproveReviewItem,
  useGetReviewStats,
  useListKnowledgeSources,
  useListReviewQueue,
  useMarkReviewItemNeedsReview,
  useRejectReviewItem,
} from "@workspace/api-client-react";
import type {
  ReviewActionBody,
  ReviewQueueItem,
  ReviewQueueStatus,
} from "@workspace/api-client-react";

const STATUS_META: Record<
  Exclude<ReviewQueueStatus, "all">,
  { label: string; className: string }
> = {
  pending: { label: "Очікують", className: "text-amber-700 bg-amber-500/10" },
  approved: { label: "Схвалено", className: "text-emerald-700 bg-emerald-500/10" },
  rejected: { label: "Відхилено", className: "text-destructive bg-destructive/10" },
  needs_review: { label: "Потрібне рев'ю", className: "text-blue-700 bg-blue-500/10" },
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/50 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: Exclude<ReviewQueueStatus, "all"> }) {
  const meta = STATUS_META[status];
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>;
}

function WarningList({ item }: { item: ReviewQueueItem }) {
  const warnings = [...item.conflictFlags, ...item.validationWarnings];
  if (warnings.length === 0) {
    return <span className="text-xs text-muted-foreground">Без конфліктів</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {warnings.map((warning) => (
        <Badge key={warning} variant="outline" className="text-[11px]">
          {warning}
        </Badge>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground break-words">{value || "—"}</div>
    </div>
  );
}

export default function ReviewQueue() {
  const [status, setStatus] = useState<ReviewQueueStatus>("pending");
  const [sourceId, setSourceId] = useState("");
  const [locale, setLocale] = useState("");
  const [conflictOnly, setConflictOnly] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params = {
    status,
    conflictOnly: conflictOnly || undefined,
    sourceId: sourceId || undefined,
    locale: locale || undefined,
    limit: 50,
    offset: 0,
  };

  const queue = useListReviewQueue(params);
  const stats = useGetReviewStats();
  const sources = useListKnowledgeSources();

  const invalidateReview = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/knowledge/review/queue"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/knowledge/review/stats"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/knowledge/runtime/status"] });
  };

  const mutationOptions = {
    mutation: {
      onSuccess: () => {
        toast({ title: "Рішення збережено" });
        invalidateReview();
      },
      onError: () => {
        toast({ title: "Не вдалося зберегти рішення", variant: "destructive" });
      },
    },
  };

  const approve = useApproveReviewItem(mutationOptions);
  const reject = useRejectReviewItem(mutationOptions);
  const needsReview = useMarkReviewItemNeedsReview(mutationOptions);

  const warnings = [
    ...(queue.data?.warnings ?? []),
    ...(stats.data?.warnings ?? []),
  ];
  const dbUnavailable = warnings.some((warning) =>
    warning.includes("DB review workflow is unavailable"),
  );

  const runAction = (
    item: ReviewQueueItem,
    action: "approve" | "reject" | "needs_review",
  ) => {
    const body: ReviewActionBody = {
      note: notes[item.id] || undefined,
      reviewedBy: "admin",
      reason: action === "reject" ? notes[item.id] || "Rejected by admin" : undefined,
    };
    if (action === "approve") approve.mutate({ id: item.id, data: body });
    if (action === "reject") reject.mutate({ id: item.id, data: body });
    if (action === "needs_review") needsReview.mutate({ id: item.id, data: body });
  };

  const items = queue.data?.items ?? [];
  const counts = stats.data?.counts ?? queue.data?.counts;

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1 py-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Черга рев'ю</h1>
            <p className="text-sm text-muted-foreground">
              Адмін-перевірка імпортованих назв перед DB runtime
            </p>
          </div>
        </div>
      </div>

      <GlobalDisclaimer />

      {dbUnavailable && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-500/5">
          <CardContent className="p-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              DB review workflow is unavailable. Static runtime remains active.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Pending" value={counts?.pending ?? 0} />
        <StatCard label="Needs review" value={counts?.needs_review ?? 0} />
        <StatCard label="Rejected" value={counts?.rejected ?? 0} />
        <StatCard label="Approved" value={counts?.approved ?? 0} />
        <StatCard label="Conflicts" value={stats.data?.conflictCount ?? queue.data?.conflictCount ?? 0} />
      </div>

      <Card className="bg-card/50">
        <CardContent className="p-5 space-y-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" />
            Фільтри
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={status} onValueChange={(value) => setStatus(value as ReviewQueueStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Очікують</SelectItem>
                <SelectItem value="needs_review">Потрібне рев'ю</SelectItem>
                <SelectItem value="approved">Схвалено</SelectItem>
                <SelectItem value="rejected">Відхилено</SelectItem>
                <SelectItem value="all">Усі</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceId || "all"} onValueChange={(value) => setSourceId(value === "all" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Джерело" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Усі джерела</SelectItem>
                {(sources.data?.sources ?? []).map((source) => (
                  <SelectItem key={source.key} value={source.key}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              placeholder="locale, напр. uk"
            />
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={conflictOnly}
                onChange={(event) => setConflictOnly(event.target.checked)}
              />
              Лише конфлікти
            </label>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setStatus("pending");
              setSourceId("");
              setLocale("");
              setConflictOnly(false);
            }}
          >
            <RotateCcw className="w-4 h-4" />
            Скинути
          </Button>
        </CardContent>
      </Card>

      {queue.isLoading && <p className="text-sm text-muted-foreground">Завантаження черги…</p>}
      {queue.isError && (
        <p className="text-sm text-destructive">Не вдалося завантажити чергу рев'ю.</p>
      )}

      {!queue.isLoading && items.length === 0 && (
        <Card className="bg-card/50">
          <CardContent className="p-6 text-center text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">
              Черга рев’ю буде активна після підключення DB.
            </p>
            <p>
              Зараз PostgreSQL може бути не підключено, тому static runtime залишається активним, а review workflow повертає безпечний порожній стан.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="bg-card/50">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground break-words">{item.displayName}</h3>
                  <p className="text-xs text-muted-foreground break-words">{item.normalizedName}</p>
                </div>
                <StatusBadge status={item.reviewStatus} />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <DetailRow label="Ingredient" value={item.mappedIngredientName} />
                <DetailRow label="Source" value={item.sourceName ?? item.sourceId} />
                <DetailRow label="Confidence" value={`${item.confidence} (${item.confidenceScore})`} />
                <DetailRow label="Locale" value={item.locale} />
                <DetailRow label="Mapping" value={item.mappingType} />
                <DetailRow label="Batch" value={item.importBatchId} />
              </div>

              <div className="space-y-1">
                <div className="text-[11px] uppercase text-muted-foreground">Warnings / conflicts</div>
                <WarningList item={item} />
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <div>Provenance: {item.provenance.sourceKey} · {item.provenance.evidenceLevel}</div>
                <div>Created: {item.createdAt ?? "—"} · Updated: {item.updatedAt ?? "—"}</div>
                <div>Reviewed: {item.reviewedAt ?? "—"} · {item.reviewedBy ?? "—"}</div>
              </div>

              <Textarea
                value={notes[item.id] ?? item.reviewNote ?? ""}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                }
                placeholder="Нотатка рев'ю"
                rows={2}
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button className="gap-1.5" onClick={() => runAction(item, "approve")}>
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={() => runAction(item, "needs_review")}>
                  <AlertTriangle className="w-4 h-4" />
                  Mark needs review
                </Button>
                <Button variant="destructive" className="gap-1.5" onClick={() => runAction(item, "reject")}>
                  <XCircle className="w-4 h-4" />
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}