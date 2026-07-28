import type {
  SeriesRestrictionEventType,
  SeriesRestrictionRecord,
} from "./model";

const TYPE_LABELS: Record<string, SeriesRestrictionEventType> = {
  "тимч. заборона": "temporary_ban",
  "пост. заборона": "permanent_ban",
  "скасув. тимч. заборони": "restore_temporary",
  "скасув. пост. заборони": "restore_permanent",
  "часткове скасув.": "partial_cancellation",
  "доповнення до документу": "supplement",
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtml(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/giu,
    (entity, code: string) => {
      const lower = code.toLowerCase();
      if (lower.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
      }
      if (lower.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
      }
      return NAMED_ENTITIES[lower] ?? entity;
    },
  );
}

function cellText(value: string): string {
  return decodeHtml(
    value.replace(/<br\s*\/?\s*>/giu, " ").replace(/<[^>]+>/gu, " "),
  )
    .replace(/[\s\u00a0]+/gu, " ")
    .trim();
}

function isoDate(value: string): string | null {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/u);
  if (!match) return null;
  const [, day, month, year] = match;
  const candidate = `${year}-${month}-${day}`;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== candidate
    ? null
    : candidate;
}

export function normalizeRegistrationNumber(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleUpperCase("uk-UA")
    .replace(/\s+/gu, "")
    .trim();
}

export function normalizeSeries(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleUpperCase("uk-UA")
    .replace(/[\s\u00a0]+/gu, " ")
    .trim();
}

export function parseSeriesValues(value: string): {
  allSeries: boolean;
  values: string[];
} {
  const normalized = normalizeSeries(value);
  const allSeries = /^(?:УСІ|ВСІ)\s+СЕРІ(?:Ї|И)$/iu.test(normalized);
  if (allSeries) return { allSeries: true, values: [] };

  const withoutPrefix = normalized.replace(
    /^(?:СЕРІЯ|СЕРІЇ|СЕРИЯ|СЕРИИ)\s*(?:№|NO|N)?\s*/iu,
    "",
  );
  const pieces = withoutPrefix
    .split(/\s*(?:,|;|(?<!\p{L})(?:ТА|І)(?!\p{L}))\s*/iu)
    .map((part) => part.replace(/^(?:№|NO|N)\s*/iu, "").trim())
    .filter(Boolean);
  const values = [...new Set([withoutPrefix, ...pieces])]
    .filter((part) => part.length <= 160)
    .slice(0, 100);
  return { allSeries: false, values };
}

export interface ParsedDlsExport {
  asOfDate: string | null;
  records: SeriesRestrictionRecord[];
  rejectedRows: number;
  rejectedSamples: string[];
}

export function parseDlsExport(
  html: string,
  expectedType?: SeriesRestrictionEventType,
): ParsedDlsExport {
  const asOfMatch = cellText(html).match(
    /станом\s+на\s+(\d{2}\.\d{2}\.\d{4})/iu,
  );
  const asOfDate = asOfMatch ? isoDate(asOfMatch[1]) : null;
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/giu);
  const records: SeriesRestrictionRecord[] = [];
  let rejectedRows = 0;
  const rejectedSamples: string[] = [];

  for (const rowMatch of rowMatches) {
    const cells = [
      ...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu),
    ].map((match) => cellText(match[1]));
    if (!cells.length || cells[0] === "Дата документу") continue;
    if (cells.length !== 10) {
      if (isoDate(cells[0] ?? "")) {
        rejectedRows += 1;
        if (rejectedSamples.length < 5) rejectedSamples.push(cells.join(" | "));
      }
      continue;
    }
    const documentDate = isoDate(cells[0]);
    const eventType = TYPE_LABELS[cells[2].toLocaleLowerCase("uk-UA")];
    if (!documentDate || !eventType || !cells[1] || !cells[4]) {
      rejectedRows += 1;
      if (rejectedSamples.length < 5) {
        rejectedSamples.push(cells.join(" | "));
      }
      continue;
    }
    if (expectedType && eventType !== expectedType) {
      throw new Error(
        `dls_export_filter_mismatch:${expectedType}:${eventType}:${cells[1]}`,
      );
    }
    const seriesUnspecified = !cells[6];
    const seriesRaw = cells[6] || "Серію не зазначено в реєстрі";
    const series = seriesUnspecified
      ? { allSeries: false, values: [] }
      : parseSeriesValues(seriesRaw);
    records.push({
      documentDate,
      documentNumber: cells[1],
      eventType,
      registrationNumber: cells[3]
        ? normalizeRegistrationNumber(cells[3])
        : null,
      medicineName: cells[4],
      dosageForm: cells[5],
      seriesRaw,
      seriesValues: series.values,
      allSeries: series.allSeries,
      seriesUnspecified,
      manufacturer: cells[7],
      country: cells[8],
      additionalInfo: cells[9],
      sourceOrder: records.length,
    });
  }

  return { asOfDate, records, rejectedRows, rejectedSamples };
}

export function eventTypeFromDlsId(id: string): SeriesRestrictionEventType {
  const byId: Record<string, SeriesRestrictionEventType> = {
    "48": "temporary_ban",
    "50": "permanent_ban",
    "58": "restore_temporary",
    "59": "restore_permanent",
    "66": "supplement",
    "93": "partial_cancellation",
  };
  const eventType = byId[id];
  if (!eventType) throw new Error(`unsupported_dls_document_type:${id}`);
  return eventType;
}
