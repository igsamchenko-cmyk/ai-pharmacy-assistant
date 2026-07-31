import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { TtlCache } from "../lib/cache";
import { resolveDataFilePath } from "../lib/dataPath";
import {
  DispensingCategorySnapshotSchema,
  dispensingCategoryRecordsHash,
  type DispensingCategorySnapshot,
} from "../knowledge/dispensingCategories/model";
import { DISPENSING_CATEGORY_FRESHNESS_MS } from "../knowledge/dispensingCategories/catalog";
import {
  ReimbursementSnapshotSchema,
  reimbursementRecordsHash,
  type ReimbursementSnapshot,
} from "../knowledge/reimbursement/model";
import { REIMBURSEMENT_FRESHNESS_MS } from "../knowledge/reimbursement/catalog";
import {
  PriceCatalogSnapshotSchema,
  priceCatalogRecordsHash,
  type PriceCatalogSnapshot,
} from "../knowledge/priceCatalog/model";
import { PRICE_CATALOG_FRESHNESS_MS } from "../knowledge/priceCatalog/catalog";
import {
  type SeriesRestrictionEventType,
  type SeriesRestrictionSnapshot,
} from "../knowledge/seriesRestrictions/model";
import {
  DLS_QUALITY_DOCUMENTS_URL,
  SERIES_RESTRICTION_FRESHNESS_MS,
  loadSeriesRestrictionSnapshot,
} from "../knowledge/seriesRestrictions/catalog";
import type { NationalListSnapshot } from "../knowledge/nationalList/model";
import { evaluateNationalListActivation } from "../knowledge/nationalList/source";

const NATIONAL_LIST_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1_000;
const RADAR_CACHE_MS = 5 * 60_000;
const EVENT_WINDOW_DAYS = 30;
const MAX_EVENTS = 50;

export type RegulatorySourceStatus =
  | "current"
  | "stale"
  | "incomplete"
  | "unavailable";

export interface RegulatoryRadarSource {
  key:
    | "series_restrictions"
    | "dispensing_categories"
    | "reimbursement"
    | "price_catalog"
    | "national_list";
  label: string;
  publisher: string;
  status: RegulatorySourceStatus;
  checkedAt: Date | null;
  releaseDate: Date | null;
  latestChangeDate: Date | null;
  recordCount: number;
  sourceUrl: string;
  note: string;
  warnings: string[];
}

export interface RegulatoryRadarEvent {
  id: string;
  date: Date;
  documentNumber: string;
  type: SeriesRestrictionEventType;
  severity: "critical" | "review" | "info";
  label: string;
  registrationNumber: string | null;
  medicineName: string;
  dosageForm: string;
  series: string;
  manufacturer: string;
  additionalInfo: string;
  sourceUrl: string;
}

export interface RegulatoryRadarPayload {
  version: "1.0";
  generatedAt: Date;
  status: "current" | "attention";
  window: { from: Date; to: Date; days: 30 };
  summary: {
    sourceCount: number;
    currentSourceCount: number;
    attentionSourceCount: number;
    recentEventCount: number;
    eventCounts: {
      temporaryBan: number;
      permanentBan: number;
      restored: number;
      other: number;
    };
  };
  sources: RegulatoryRadarSource[];
  events: RegulatoryRadarEvent[];
  notices: string[];
}

interface RadarSnapshots {
  series: SeriesRestrictionSnapshot;
  dispensing: DispensingCategorySnapshot;
  reimbursement: ReimbursementSnapshot;
  price: PriceCatalogSnapshot;
  nationalList: NationalListSnapshot;
}

const radarCache = new TtlCache<RegulatoryRadarPayload>({
  ttlMs: RADAR_CACHE_MS,
  maxEntries: 1,
});

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(resolveDataFilePath(filePath), "utf8"));
}

function verifySnapshots(): RadarSnapshots {
  const series = loadSeriesRestrictionSnapshot();

  const dispensing = DispensingCategorySnapshotSchema.parse(
    readJson("data/dispensing-categories/ua-drlz.json"),
  );
  if (
    dispensingCategoryRecordsHash(dispensing.records) !==
      dispensing.source.recordsSha256 ||
    dispensing.records.length !== dispensing.source.recordCount
  ) {
    throw new Error("regulatory_radar_dispensing_snapshot_invalid");
  }

  const reimbursement = ReimbursementSnapshotSchema.parse(
    readJson("data/reimbursement/ua-nszu-2026-07-17.json"),
  );
  if (
    reimbursementRecordsHash(reimbursement.records) !==
      reimbursement.source.recordsSha256 ||
    reimbursement.records.length !== reimbursement.source.recordCount
  ) {
    throw new Error("regulatory_radar_reimbursement_snapshot_invalid");
  }

  const price = PriceCatalogSnapshotSchema.parse(
    readJson("data/price-catalog/ua-moz-2026-07-01.json"),
  );
  if (
    priceCatalogRecordsHash(price.records) !== price.source.recordsSha256 ||
    price.records.length !== price.source.recordCount
  ) {
    throw new Error("regulatory_radar_price_snapshot_invalid");
  }

  const nationalList = readJson(
    "data/national-list/ua-2025-10-10.json",
  ) as NationalListSnapshot;
  if (!evaluateNationalListActivation(nationalList).ready) {
    throw new Error("regulatory_radar_national_list_snapshot_invalid");
  }

  return { series, dispensing, reimbursement, price, nationalList };
}

export function evaluateRegulatorySourceStatus(options: {
  checkedAt: string;
  now: Date;
  freshnessMs: number;
  complete: boolean;
}): RegulatorySourceStatus {
  if (!options.complete) return "incomplete";
  const checkedAt = new Date(options.checkedAt).getTime();
  const age = options.now.getTime() - checkedAt;
  return Number.isFinite(checkedAt) && age >= 0 && age <= options.freshnessMs
    ? "current"
    : "stale";
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function translatedWarnings(warnings: string[]): string[] {
  return warnings.map((warning) => {
    if (warning.startsWith("published_summary_count_mismatch:")) {
      return "Кількість позицій у повідомленні відрізняється від фактичної кількості рядків документа; радар використовує перевірений документ.";
    }
    return warning;
  });
}

function eventPresentation(type: SeriesRestrictionEventType): {
  label: string;
  severity: RegulatoryRadarEvent["severity"];
} {
  switch (type) {
    case "temporary_ban":
      return { label: "Тимчасова заборона", severity: "critical" };
    case "permanent_ban":
      return { label: "Постійна заборона", severity: "critical" };
    case "restore_temporary":
      return {
        label: "Поновлення після тимчасової заборони",
        severity: "info",
      };
    case "restore_permanent":
      return { label: "Поновлення після постійної заборони", severity: "info" };
    case "partial_cancellation":
      return { label: "Часткове скасування", severity: "review" };
    case "supplement":
      return { label: "Доповнення до розпорядження", severity: "review" };
  }
}

function recentEvents(
  snapshot: SeriesRestrictionSnapshot,
  windowFrom: string,
  windowTo: string,
): {
  all: SeriesRestrictionSnapshot["records"];
  visible: RegulatoryRadarEvent[];
} {
  const all = snapshot.records
    .filter(
      (record) =>
        record.documentDate >= windowFrom && record.documentDate <= windowTo,
    )
    .sort(
      (left, right) =>
        right.documentDate.localeCompare(left.documentDate) ||
        right.documentNumber.localeCompare(left.documentNumber, "uk-UA", {
          numeric: true,
        }) ||
        right.sourceOrder - left.sourceOrder,
    );
  const visible = all.slice(0, MAX_EVENTS).map((record) => {
    const presentation = eventPresentation(record.eventType);
    const id = createHash("sha256")
      .update(
        `${record.documentDate}|${record.documentNumber}|${record.sourceOrder}`,
      )
      .digest("hex")
      .slice(0, 20);
    return {
      id,
      date: dateOnly(record.documentDate),
      documentNumber: record.documentNumber,
      type: record.eventType,
      severity: presentation.severity,
      label: presentation.label,
      registrationNumber: record.registrationNumber,
      medicineName: record.medicineName,
      dosageForm: record.dosageForm,
      series: record.seriesRaw,
      manufacturer: record.manufacturer,
      additionalInfo: record.additionalInfo,
      sourceUrl: DLS_QUALITY_DOCUMENTS_URL,
    };
  });
  return { all, visible };
}

export function buildRegulatoryRadar(
  snapshots: RadarSnapshots,
  now = new Date(),
): RegulatoryRadarPayload {
  const nationalGate = evaluateNationalListActivation(snapshots.nationalList);
  const sources: RegulatoryRadarSource[] = [
    {
      key: "series_restrictions",
      label: "Заборони та поновлення серій",
      publisher: snapshots.series.source.publisher,
      status: evaluateRegulatorySourceStatus({
        checkedAt: snapshots.series.generatedAt,
        now,
        freshnessMs: SERIES_RESTRICTION_FRESHNESS_MS,
        complete:
          snapshots.series.source.complete &&
          snapshots.series.warnings.length === 0,
      }),
      checkedAt: new Date(snapshots.series.generatedAt),
      releaseDate: null,
      latestChangeDate: snapshots.series.source.latestDocumentDate
        ? dateOnly(snapshots.series.source.latestDocumentDate)
        : null,
      recordCount: snapshots.series.source.recordCount,
      sourceUrl: snapshots.series.source.url,
      note: "Щоденний контроль розпоряджень Держлікслужби за серією та реєстраційним номером.",
      warnings: snapshots.series.warnings,
    },
    {
      key: "dispensing_categories",
      label: "ДРЛЗ та категорія відпуску",
      publisher: snapshots.dispensing.source.publisher,
      status: evaluateRegulatorySourceStatus({
        checkedAt: snapshots.dispensing.source.checkedAt,
        now,
        freshnessMs: DISPENSING_CATEGORY_FRESHNESS_MS,
        complete:
          snapshots.dispensing.source.complete &&
          snapshots.dispensing.warnings.length === 0,
      }),
      checkedAt: new Date(snapshots.dispensing.source.checkedAt),
      releaseDate: null,
      latestChangeDate: null,
      recordCount: snapshots.dispensing.source.recordCount,
      sourceUrl: snapshots.dispensing.source.registryUrl,
      note: "Точні реєстрові позиції та офіційні умови рецептурного або безрецептурного відпуску.",
      warnings: snapshots.dispensing.warnings,
    },
    {
      key: "reimbursement",
      label: "Реімбурсація «Доступні ліки»",
      publisher: snapshots.reimbursement.source.publisher,
      status: evaluateRegulatorySourceStatus({
        checkedAt: snapshots.reimbursement.source.checkedAt,
        now,
        freshnessMs: REIMBURSEMENT_FRESHNESS_MS,
        complete: snapshots.reimbursement.source.complete,
      }),
      checkedAt: new Date(snapshots.reimbursement.source.checkedAt),
      releaseDate: dateOnly(snapshots.reimbursement.source.releaseDate),
      latestChangeDate: dateOnly(snapshots.reimbursement.source.releaseDate),
      recordCount: snapshots.reimbursement.source.recordCount,
      sourceUrl: snapshots.reimbursement.source.documentUrl,
      note: "Перевірка виконується лише для точної упаковки з її сумою доплати.",
      warnings: translatedWarnings(snapshots.reimbursement.warnings),
    },
    {
      key: "price_catalog",
      label: "Національний каталог цін",
      publisher: snapshots.price.source.publisher,
      status: evaluateRegulatorySourceStatus({
        checkedAt: snapshots.price.source.checkedAt,
        now,
        freshnessMs: PRICE_CATALOG_FRESHNESS_MS,
        complete: snapshots.price.source.complete,
      }),
      checkedAt: new Date(snapshots.price.source.checkedAt),
      releaseDate: dateOnly(snapshots.price.source.releaseDate),
      latestChangeDate: dateOnly(snapshots.price.source.releaseDate),
      recordCount: snapshots.price.source.recordCount,
      sourceUrl: snapshots.price.source.landingUrl,
      note: "Гранична роздрібна ціна звіряється для точної упаковки; реімбурсаційні позиції мають окреме джерело.",
      warnings: snapshots.price.warnings,
    },
    {
      key: "national_list",
      label: "Національний перелік основних ЛЗ",
      publisher: "Кабінет Міністрів України",
      status: evaluateRegulatorySourceStatus({
        checkedAt: snapshots.nationalList.source.checkedAt,
        now,
        freshnessMs: NATIONAL_LIST_FRESHNESS_MS,
        complete: nationalGate.ready,
      }),
      checkedAt: new Date(snapshots.nationalList.source.checkedAt),
      releaseDate: dateOnly(snapshots.nationalList.source.effectiveDate),
      latestChangeDate: dateOnly(snapshots.nationalList.source.revisionDate),
      recordCount: snapshots.nationalList.counts.valid,
      sourceUrl: snapshots.nationalList.source.canonicalUrl,
      note: "Відповідність визначається за МНН, формою, шляхом введення та дозуванням, а не лише за торговою назвою.",
      warnings: nationalGate.blockers,
    },
  ];

  const windowTo =
    snapshots.series.source.latestDocumentDate ??
    now.toISOString().slice(0, 10);
  const fromDate = dateOnly(windowTo);
  fromDate.setUTCDate(fromDate.getUTCDate() - (EVENT_WINDOW_DAYS - 1));
  const windowFrom = fromDate.toISOString().slice(0, 10);
  const recent = recentEvents(snapshots.series, windowFrom, windowTo);
  const restoredTypes = new Set<SeriesRestrictionEventType>([
    "restore_temporary",
    "restore_permanent",
  ]);
  const eventCounts = {
    temporaryBan: recent.all.filter(
      (event) => event.eventType === "temporary_ban",
    ).length,
    permanentBan: recent.all.filter(
      (event) => event.eventType === "permanent_ban",
    ).length,
    restored: recent.all.filter((event) => restoredTypes.has(event.eventType))
      .length,
    other: recent.all.filter(
      (event) =>
        event.eventType !== "temporary_ban" &&
        event.eventType !== "permanent_ban" &&
        !restoredTypes.has(event.eventType),
    ).length,
  };
  const currentSourceCount = sources.filter(
    (source) => source.status === "current",
  ).length;

  return {
    version: "1.0",
    generatedAt: now,
    status: currentSourceCount === sources.length ? "current" : "attention",
    window: {
      from: dateOnly(windowFrom),
      to: dateOnly(windowTo),
      days: 30,
    },
    summary: {
      sourceCount: sources.length,
      currentSourceCount,
      attentionSourceCount: sources.length - currentSourceCount,
      recentEventCount: recent.all.length,
      eventCounts,
    },
    sources,
    events: recent.visible,
    notices: [
      "Журнал охоплює 30 календарних днів до останньої дати, наявної у перевіреному знімку Держлікслужби.",
      "Подія про заборону або поновлення не замінює перевірку хронології документів для конкретної серії перед відпуском.",
      "Якщо джерело прострочене або неповне, висновок потрібно підтвердити безпосередньо в офіційному реєстрі.",
    ],
  };
}

export function loadRegulatoryRadar(
  options: {
    now?: Date;
    snapshots?: RadarSnapshots;
  } = {},
): RegulatoryRadarPayload {
  if (options.now || options.snapshots) {
    return buildRegulatoryRadar(
      options.snapshots ?? verifySnapshots(),
      options.now ?? new Date(),
    );
  }
  const cached = radarCache.get("radar");
  if (cached) return cached;
  const payload = buildRegulatoryRadar(verifySnapshots(), new Date());
  radarCache.set("radar", payload);
  return payload;
}

export function clearRegulatoryRadarCache(): void {
  radarCache.clear();
}
