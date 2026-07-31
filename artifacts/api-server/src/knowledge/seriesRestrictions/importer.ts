import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  SeriesRestrictionSnapshotSchema,
  type SeriesRestrictionRecord,
  type SeriesRestrictionSnapshot,
} from "./model";
import { eventTypeFromDlsId, parseDlsExport } from "./parser";

export const DLS_EXPORT_URL = "https://pub-mex.dls.gov.ua/QLA/DocList.aspx";
export const DLS_DOCUMENT_TYPE_IDS = [
  "48",
  "50",
  "58",
  "59",
  "66",
  "93",
] as const;
const EXPORT_ROW_LIMIT = 10_000;

interface DateRange {
  from: string;
  to: string;
}

interface ImportResult {
  records: SeriesRestrictionRecord[];
  requestCount: number;
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  capture(headers: Headers): void {
    const values =
      "getSetCookie" in headers && typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : [headers.get("set-cookie") ?? ""];
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) {
        this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
  }

  header(): string {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function hiddenFields(html: string): URLSearchParams {
  const params = new URLSearchParams();
  for (const match of html.matchAll(/<input\b([^>]+)>/giu)) {
    const attrs = match[1];
    if (!/\btype=["']hidden["']/iu.test(attrs)) continue;
    const name = attrs.match(/\bname=["']([^"']+)["']/iu)?.[1];
    if (!name) continue;
    const value = attrs.match(/\bvalue=["']([^"']*)["']/iu)?.[1] ?? "";
    params.set(name, value.replace(/&amp;/gu, "&"));
  }
  return params;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function splitRange(range: DateRange): [DateRange, DateRange] | null {
  const start = new Date(`${range.from}T00:00:00.000Z`).getTime();
  const end = new Date(`${range.to}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    return null;
  const dayMs = 24 * 60 * 60 * 1_000;
  const middleDays = Math.floor((end - start) / dayMs / 2);
  const middle = new Date(start + middleDays * dayMs)
    .toISOString()
    .slice(0, 10);
  return [
    { from: range.from, to: middle },
    { from: nextDate(middle), to: range.to },
  ];
}

async function request(
  url: string,
  init: RequestInit,
  jar: CookieJar,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) headers.set("cookie", cookie);
  headers.set(
    "user-agent",
    "AI-Pharmacy-Assistant/1.0 official-DLS-snapshot-importer",
  );
  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "follow",
    signal: init.signal ?? signal,
  });
  jar.capture(response.headers);
  if (!response.ok) {
    throw new Error(`dls_http_${response.status}`);
  }
  return response;
}

async function downloadRange(
  documentTypeId: string,
  range: DateRange,
  signal?: AbortSignal,
): Promise<SeriesRestrictionRecord[]> {
  const jar = new CookieJar();
  const initial = await request(DLS_EXPORT_URL, {}, jar, signal);
  const initialHtml = await initial.text();
  const search = hiddenFields(initialHtml);
  search.set("__EVENTTARGET", "ctl00$Content$fvParams$UpdateButton");
  search.set("__EVENTARGUMENT", "");
  search.set("ctl00$Content$fvParams$edtDocNum", "");
  search.set("ctl00$Content$fvParams$edtRPNumber", "");
  search.set("ctl00$Content$fvParams$edtDocDateBegin", formatDate(range.from));
  search.set("ctl00$Content$fvParams$edtDocDateEnd", formatDate(range.to));
  search.set("ctl00$Content$fvParams$edtDrugName", "");
  search.set("ctl00$Content$fvParams$edtDocTypeId", documentTypeId);
  search.set("ctl00$Content$fvParams$edtProducerName", "");
  search.set("ctl00$Content$fvParams$edtViewMode", "2");
  search.set("ctl00$Content$fvParams$edtSerialNum", "");
  const searchResponse = await request(
    DLS_EXPORT_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: search,
    },
    jar,
    signal,
  );
  const searchHtml = await searchResponse.text();
  const exportParams = hiddenFields(searchHtml);
  exportParams.set("__EVENTTARGET", "__Page");
  exportParams.set("__EVENTARGUMENT", "Export$Main");
  const exportResponse = await request(
    DLS_EXPORT_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: exportParams,
    },
    jar,
    signal,
  );
  const contentType = exportResponse.headers.get("content-type") ?? "";
  if (
    !contentType.toLocaleLowerCase("en-US").includes("application/vnd.ms-excel")
  ) {
    throw new Error(`dls_unexpected_export_type:${contentType}`);
  }
  const html = new TextDecoder("utf-8").decode(
    await exportResponse.arrayBuffer(),
  );
  const parsed = parseDlsExport(html, eventTypeFromDlsId(documentTypeId));
  if (parsed.rejectedRows > 0) {
    throw new Error(
      `dls_rejected_rows:${documentTypeId}:${range.from}:${range.to}:${parsed.rejectedRows}:${JSON.stringify(parsed.rejectedSamples)}`,
    );
  }
  return parsed.records;
}

async function importRange(
  documentTypeId: string,
  range: DateRange,
  signal?: AbortSignal,
): Promise<ImportResult> {
  const records = await downloadRange(documentTypeId, range, signal);
  if (records.length < EXPORT_ROW_LIMIT) {
    return { records, requestCount: 1 };
  }
  const split = splitRange(range);
  if (!split) {
    throw new Error(
      `dls_export_limit_on_single_day:${documentTypeId}:${range.from}`,
    );
  }
  const left = await importRange(documentTypeId, split[0], signal);
  const right = await importRange(documentTypeId, split[1], signal);
  return {
    records: [...left.records, ...right.records],
    requestCount: 1 + left.requestCount + right.requestCount,
  };
}

export function seriesRestrictionRecordIdentity(
  record: SeriesRestrictionRecord,
): string {
  return JSON.stringify([
    record.documentDate,
    record.documentNumber,
    record.eventType,
    record.registrationNumber,
    record.seriesRaw,
  ]);
}

function recordKey(record: SeriesRestrictionRecord): string {
  return JSON.stringify([
    record.documentDate,
    record.documentNumber,
    record.eventType,
    record.registrationNumber,
    record.medicineName,
    record.dosageForm,
    record.seriesRaw,
    record.manufacturer,
    record.country,
    record.additionalInfo,
  ]);
}

export async function importSeriesRestrictions(
  options: {
    from?: string;
    to?: string;
    signal?: AbortSignal;
  } = {},
): Promise<SeriesRestrictionSnapshot> {
  const from = options.from ?? "2000-01-01";
  const to = options.to ?? new Date().toISOString().slice(0, 10);
  const allRecords: SeriesRestrictionRecord[] = [];
  let requestCount = 0;

  for (const documentTypeId of DLS_DOCUMENT_TYPE_IDS) {
    const imported = await importRange(
      documentTypeId,
      { from, to },
      options.signal,
    );
    allRecords.push(...imported.records);
    requestCount += imported.requestCount;
  }

  const records = [
    ...new Map(
      allRecords.map((record) => [recordKey(record), record]),
    ).values(),
  ]
    .sort(
      (left, right) =>
        left.documentDate.localeCompare(right.documentDate) ||
        left.documentNumber.localeCompare(right.documentNumber, "uk-UA", {
          numeric: true,
        }) ||
        (left.registrationNumber ?? "").localeCompare(
          right.registrationNumber ?? "",
        ) ||
        left.seriesRaw.localeCompare(right.seriesRaw, "uk-UA", {
          numeric: true,
        }),
    )
    .map((record, sourceOrder) => ({ ...record, sourceOrder }));
  const sha256 = createHash("sha256")
    .update(JSON.stringify(records))
    .digest("hex");
  const latestDocumentDate = records.at(-1)?.documentDate ?? null;
  return SeriesRestrictionSnapshotSchema.parse({
    schemaVersion: "ua-dls-series-restrictions-v1",
    generatedAt: new Date().toISOString(),
    source: {
      title: "Реєстр документів щодо якості лікарських засобів",
      publisher:
        "Державна служба України з лікарських засобів та контролю за наркотиками",
      url: DLS_EXPORT_URL,
      coverageStartDate: from,
      latestDocumentDate,
      complete: true,
      recordCount: records.length,
      requestCount,
      sha256,
      documentTypeIds: [...DLS_DOCUMENT_TYPE_IDS],
    },
    records,
    warnings: [],
  });
}

export function seriesRestrictionOverlapStart(
  snapshot: SeriesRestrictionSnapshot,
  overlapDays = 45,
): string {
  const latest = snapshot.source.latestDocumentDate;
  if (!latest) return snapshot.source.coverageStartDate;
  const date = new Date(`${latest}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - Math.max(1, overlapDays));
  return date.toISOString().slice(0, 10);
}

export function mergeSeriesRestrictionSnapshots(
  previous: SeriesRestrictionSnapshot,
  refresh: SeriesRestrictionSnapshot,
): SeriesRestrictionSnapshot {
  const refreshByIdentity = new Map<string, SeriesRestrictionRecord[]>();
  for (const record of refresh.records) {
    const identity = seriesRestrictionRecordIdentity(record);
    const group = refreshByIdentity.get(identity) ?? [];
    group.push(record);
    refreshByIdentity.set(identity, group);
  }
  const mergedRecords = previous.records.map((record) => {
    const identity = seriesRestrictionRecordIdentity(record);
    const replacements = refreshByIdentity.get(identity);
    const replacement = replacements?.shift();
    if (replacements && replacements.length === 0) {
      refreshByIdentity.delete(identity);
    }
    return replacement ?? record;
  });
  for (const records of refreshByIdentity.values()) {
    mergedRecords.push(...records);
  }
  const records = mergedRecords
    .sort(
      (left, right) =>
        left.documentDate.localeCompare(right.documentDate) ||
        left.documentNumber.localeCompare(right.documentNumber, "uk-UA", {
          numeric: true,
        }) ||
        (left.registrationNumber ?? "").localeCompare(
          right.registrationNumber ?? "",
        ) ||
        left.seriesRaw.localeCompare(right.seriesRaw, "uk-UA", {
          numeric: true,
        }),
    )
    .map((record, sourceOrder) => ({ ...record, sourceOrder }));
  const sha256 = createHash("sha256")
    .update(JSON.stringify(records))
    .digest("hex");

  return SeriesRestrictionSnapshotSchema.parse({
    ...refresh,
    source: {
      ...refresh.source,
      coverageStartDate: previous.source.coverageStartDate,
      latestDocumentDate:
        records.at(-1)?.documentDate ?? previous.source.latestDocumentDate,
      complete: previous.source.complete && refresh.source.complete,
      recordCount: records.length,
      sha256,
    },
    records,
    warnings: [...new Set([...previous.warnings, ...refresh.warnings])],
  });
}

export async function writeSeriesRestrictionSnapshot(
  outputPath = resolve(process.cwd(), "data/series-restrictions/ua-dls.json"),
  options: {
    from?: string;
    to?: string;
    previousSnapshot?: SeriesRestrictionSnapshot;
    overlapDays?: number;
  } = {},
): Promise<SeriesRestrictionSnapshot> {
  const from =
    options.from ??
    (options.previousSnapshot
      ? seriesRestrictionOverlapStart(
          options.previousSnapshot,
          options.overlapDays,
        )
      : undefined);
  const refresh = await importSeriesRestrictions({ from, to: options.to });
  const snapshot = options.previousSnapshot
    ? mergeSeriesRestrictionSnapshots(options.previousSnapshot, refresh)
    : refresh;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}
