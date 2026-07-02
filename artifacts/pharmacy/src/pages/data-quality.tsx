import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GlobalDisclaimer } from "@/components/disclaimer";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Database,
  BookOpen,
  ExternalLink,
  Download,
  Upload,
  ListChecks,
  GitCompareArrows,
} from "lucide-react";
import {
  useGetDataQuality,
  useListKnowledgeSources,
  useGetImportPreview,
} from "@workspace/api-client-react";
import type {
  QualityIssue,
  ProvenanceSource,
  ImportPreview,
  ImportConflict,
} from "@workspace/api-client-react";

const CONFLICT_TYPE_LABEL: Record<ImportConflict["type"], string> = {
  name_multiple_ingredients: "Назва → кілька речовин",
  brand_conflicting_inn: "Бренд → суперечлива МНН",
  ingredient_duplicate_name: "Речовина → дубль назви",
  atc_unknown_class: "ATC → невідомий клас",
  low_confidence_review: "Низька довіра",
};

const REVIEW_STATUS_LABEL: Record<
  keyof ImportPreview["reviewDistribution"],
  { label: string; className: string }
> = {
  approved: { label: "Схвалено", className: "text-emerald-600" },
  pending: { label: "Очікують", className: "text-amber-600" },
  needs_review: { label: "На перевірку", className: "text-blue-600" },
  rejected: { label: "Відхилено", className: "text-destructive" },
};

const SOURCE_TYPE_LABEL: Record<ProvenanceSource["type"], string> = {
  official: "Офіційне",
  reference: "Довідник",
  demo: "Демо",
  external: "Зовнішнє API",
};

const RELIABILITY_META: Record<
  ProvenanceSource["reliability"],
  { label: string; className: string }
> = {
  high: { label: "Висока", className: "text-emerald-600" },
  medium: { label: "Середня", className: "text-amber-600" },
  low: { label: "Низька", className: "text-muted-foreground" },
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/50 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function CoverageBar({
  label,
  pct,
  detail,
}: {
  label: string;
  pct: number;
  detail: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-foreground font-medium">{label}</span>
        <span className="text-muted-foreground">
          {detail} ({pct}%)
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: QualityIssue }) {
  const isError = issue.severity === "error";
  return (
    <div className="flex gap-2 py-2 border-b border-border/50 last:border-0">
      {isError ? (
        <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
      ) : (
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
      )}
      <div className="min-w-0">
        <p className="text-sm text-foreground leading-snug">{issue.message}</p>
        <code className="text-[11px] text-muted-foreground">{issue.code}</code>
      </div>
    </div>
  );
}

export default function DataQuality() {
  const quality = useGetDataQuality();
  const sourcesQuery = useListKnowledgeSources();
  const importPreview = useGetImportPreview();

  const report = quality.data;
  const sources = sourcesQuery.data?.sources ?? [];
  const preview = importPreview.data;

  function handleExport() {
    const payload = {
      exportedAt: new Date().toISOString(),
      quality: report ?? null,
      sources,
      importPreview: preview ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data-quality-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1 py-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
            <Database className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">
              Якість даних
            </h1>
            <p className="text-sm text-muted-foreground">
              Внутрішня панель: цілісність бази знань і провенанс джерел
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!report}
            className="gap-1.5"
          >
            <Download className="w-4 h-4" />
            Експорт JSON
          </Button>
        </div>
      </div>

      <GlobalDisclaimer />

      {quality.isLoading && (
        <p className="text-sm text-muted-foreground">Завантаження звіту…</p>
      )}
      {quality.isError && (
        <p className="text-sm text-destructive">
          Не вдалося завантажити звіт якості даних.
        </p>
      )}

      {report && (
        <>
          <Card
            className={`border-l-4 ${report.ok ? "border-l-emerald-500" : "border-l-destructive"} bg-card/50`}
          >
            <CardContent className="p-5 flex items-center gap-4">
              {report.ok ? (
                <ShieldCheck className="w-8 h-8 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-destructive shrink-0" />
              )}
              <div>
                <h3 className="font-bold text-foreground text-lg">
                  {report.ok
                    ? "Перевірку пройдено"
                    : "Виявлено критичні помилки"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {report.errors.length} помилок · {report.warnings.length}{" "}
                  попереджень
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-5">
              <h3 className="font-bold text-foreground mb-4">Обсяг бази знань</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard
                  label="Діючі речовини"
                  value={report.counts.ingredients}
                />
                <StatCard label="Назви (mappings)" value={report.counts.mappings} />
                <StatCard
                  label="Правила взаємодій"
                  value={report.counts.interactionRules}
                />
                <StatCard label="Куровані" value={report.counts.curatedRules} />
                <StatCard
                  label="Згенеровані"
                  value={report.counts.generatedRules}
                />
                <StatCard label="Препарати" value={report.counts.drugs} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-bold text-foreground">Покриття провенансом</h3>
              <CoverageBar
                label="Назви з джерелом"
                pct={report.coverage.mappingProvenancePct}
                detail={`${report.coverage.mappingsWithProvenance}/${report.counts.mappings}`}
              />
              <CoverageBar
                label="Правила з джерелом"
                pct={report.coverage.ruleSourcePct}
                detail={`${report.coverage.rulesWithSource}/${report.counts.interactionRules}`}
              />
              <CoverageBar
                label="Препарати з коректним ATC"
                pct={report.coverage.drugAtcPct}
                detail={`${report.coverage.drugsWithValidAtc}/${report.counts.drugs}`}
              />
            </CardContent>
          </Card>

          {preview && (
            <Card className="bg-card/50">
              <CardContent className="p-5 space-y-5">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  Попередній перегляд імпорту словника
                </h3>
                <p className="text-sm text-muted-foreground -mt-2">
                  Аналіз вбудованого зразка проти живої бази знань (без запису).
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Рядків" value={preview.rowsParsed} />
                  <StatCard label="Нові речовини" value={preview.newIngredients} />
                  <StatCard label="Нові назви" value={preview.newMappings} />
                  <StatCard label="Дублікати" value={preview.duplicates} />
                  <StatCard label="Відсутні джерела" value={preview.missingSources} />
                  <StatCard label="Некоректні ATC" value={preview.invalidAtc} />
                  <StatCard
                    label="Пропрієтарні"
                    value={preview.copyrightViolations}
                  />
                  <StatCard label="Помилки розбору" value={preview.parseErrors} />
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-muted-foreground" />
                    Черга рецензування
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      Object.keys(
                        REVIEW_STATUS_LABEL,
                      ) as (keyof ImportPreview["reviewDistribution"])[]
                    ).map((key) => (
                      <div
                        key={key}
                        className="bg-muted/50 rounded-lg px-3 py-2 text-center"
                      >
                        <div
                          className={`text-lg font-bold ${REVIEW_STATUS_LABEL[key].className}`}
                        >
                          {preview.reviewDistribution[key]}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {REVIEW_STATUS_LABEL[key].label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">
                    Розподіл рівнів довіри
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    {(["low", "medium", "high", "verified"] as const).map((k) => (
                      <div key={k} className="bg-muted/50 rounded-lg px-3 py-2">
                        <div className="text-lg font-bold text-foreground">
                          {preview.confidenceDistribution[k]}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {k}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {preview.conflicts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                      <GitCompareArrows className="w-4 h-4 text-amber-500" />
                      Конфлікти ({preview.conflicts.length})
                    </h4>
                    <div className="rounded-lg border border-border/60 divide-y divide-border/50">
                      {preview.conflicts.map((c, i) => (
                        <div
                          key={`${c.type}-${i}`}
                          className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 py-2"
                        >
                          <span className="text-[11px] uppercase tracking-wide text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0 w-fit">
                            {CONFLICT_TYPE_LABEL[c.type]}
                          </span>
                          <span className="text-sm text-foreground">
                            {c.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className={`text-sm font-medium rounded-lg px-3 py-2 ${
                    preview.wouldSucceed
                      ? "text-emerald-700 bg-emerald-500/10"
                      : "text-destructive bg-destructive/10"
                  }`}
                >
                  {preview.wouldSucceed
                    ? "✅ Імпорт буде успішним — блокуючих проблем немає."
                    : "❌ Імпорт заблоковано — усуньте критичні проблеми."}
                </div>
              </CardContent>
            </Card>
          )}

          {report.warnings.length > 0 && (
            <Card className="bg-card/50">
              <CardContent className="p-5">
                <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Попередження ({report.warnings.length})
                </h3>
                <div className="max-h-72 overflow-y-auto">
                  {report.warnings.map((w, i) => (
                    <IssueRow key={`${w.code}-${i}`} issue={w} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {report.errors.length > 0 && (
            <Card className="border-l-4 border-l-destructive bg-card/50">
              <CardContent className="p-5">
                <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-destructive" />
                  Помилки ({report.errors.length})
                </h3>
                <div className="max-h-72 overflow-y-auto">
                  {report.errors.map((e, i) => (
                    <IssueRow key={`${e.code}-${i}`} issue={e} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card className="bg-card/50">
        <CardContent className="p-5">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Реєстр джерел ({sources.length})
          </h3>
          {sourcesQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Завантаження джерел…</p>
          )}
          <div className="space-y-3">
            {sources.map((source) => {
              const rel = RELIABILITY_META[source.reliability];
              return (
                <div
                  key={source.key}
                  className="py-3 border-b border-border/50 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {source.label}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {SOURCE_TYPE_LABEL[source.type]}
                    </span>
                    <span className={`text-xs font-medium ${rel.className}`}>
                      надійність: {rel.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                    {source.note}
                  </p>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {source.url}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
