import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  readSearchMetrics,
  type SearchMetricRecord,
} from "@/lib/search-metrics";

type MetricKey = "ttir" | "ttfr" | "ttc";

export interface SearchMetricDistribution {
  count: number;
  median: number | null;
  p90: number | null;
}

export function metricDistribution(
  records: readonly SearchMetricRecord[],
  key: MetricKey,
): SearchMetricDistribution {
  const values = records
    .map((record) => record[key])
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )
    .sort((left, right) => left - right);
  if (!values.length) return { count: 0, median: null, p90: null };
  const percentile = (ratio: number) =>
    values[Math.max(0, Math.ceil(values.length * ratio) - 1)] ?? null;
  return {
    count: values.length,
    median: percentile(0.5),
    p90: percentile(0.9),
  };
}

function formatMilliseconds(value: number | null): string {
  return value === null
    ? "—"
    : `${Math.round(value).toLocaleString("uk-UA")} мс`;
}

function formatBytes(value: number | null): string {
  if (value === null) return "—";
  return `${(value / 1024 / 1024).toLocaleString("uk-UA", {
    maximumFractionDigits: 2,
  })} МБ`;
}

function SummaryCard({
  title,
  records,
}: {
  title: string;
  records: readonly SearchMetricRecord[];
}) {
  const rows = [
    ["TTIR", metricDistribution(records, "ttir")],
    ["TTFR", metricDistribution(records, "ttfr")],
    ["TTC", metricDistribution(records, "ttc")],
  ] as const;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(([label, distribution]) => (
          <div
            key={label}
            className="grid grid-cols-[auto_1fr_1fr] gap-3 text-sm"
          >
            <span className="font-semibold">{label}</span>
            <span>медіана: {formatMilliseconds(distribution.median)}</span>
            <span>p90: {formatMilliseconds(distribution.p90)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function PerfMetricsPage() {
  const [records, setRecords] = useState<SearchMetricRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await readSearchMetrics());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cold = useMemo(
    () => records.filter((record) => record.cold === true),
    [records],
  );
  const warm = useMemo(
    () => records.filter((record) => record.cold === false),
    [records],
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-6 w-6 text-primary" />
            Продуктивність пошуку
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Локальні вимірювання цього браузера. Дані не надсилаються на сервер.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Оновити
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard title={`Cold · ${cold.length}`} records={cold} />
        <SummaryCard title={`Warm · ${warm.length}`} records={warm} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Останні вимірювання</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Завантаження…</p>
          ) : records.length ? (
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-3">Час</th>
                    <th className="px-2 py-3">Режим</th>
                    <th className="px-2 py-3">TTIR</th>
                    <th className="px-2 py-3">TTFR</th>
                    <th className="px-2 py-3">TTC</th>
                    <th className="px-2 py-3">Побудова</th>
                    <th className="px-2 py-3">Каталог</th>
                    <th className="px-2 py-3">Розмір</th>
                    <th className="px-2 py-3">Пристрій</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="whitespace-nowrap px-2 py-3">
                        {new Date(record.ts).toLocaleString("uk-UA")}
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant="outline">
                          {record.cold === null
                            ? "очікує"
                            : record.cold
                              ? "cold"
                              : "warm"}
                        </Badge>
                      </td>
                      <td className="px-2 py-3">
                        {formatMilliseconds(record.ttir)}
                      </td>
                      <td className="px-2 py-3">
                        {formatMilliseconds(record.ttfr)}
                      </td>
                      <td className="px-2 py-3">
                        {formatMilliseconds(record.ttc)}
                      </td>
                      <td className="px-2 py-3">
                        {formatMilliseconds(record.indexBuildMs)}
                      </td>
                      <td className="px-2 py-3">
                        {record.catalogSize?.toLocaleString("uk-UA") ?? "—"}
                      </td>
                      <td className="px-2 py-3">
                        {formatBytes(record.serializedIndexBytes)}
                      </td>
                      <td className="px-2 py-3">
                        {record.uaMobile ? "mobile" : "desktop"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Даних ще немає. Виконайте пошук і відкрийте картку препарату.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
