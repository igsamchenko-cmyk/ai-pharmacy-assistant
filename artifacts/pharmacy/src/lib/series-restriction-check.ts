import type {
  ProductSeriesRestrictionSummary,
  SeriesRestrictionCheckStatus,
  SeriesRestrictionEventEventType,
} from "@workspace/api-client-react";

/** Mirrors the server-side `^[^\r\n]+$`, 1-80 char contract for `series`. */
export const SERIES_INPUT_MAX_LENGTH = 80;

/**
 * Client-side guard before calling `GET /catalog/series-restrictions`. The
 * server independently normalizes (uppercases, collapses whitespace) and
 * validates the series, so this only trims/caps what we send — it never
 * has to agree byte-for-byte with the server's normalization.
 */
export function normalizeSeriesQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\r\n]+/gu, " ")
    .trim()
    .slice(0, SERIES_INPUT_MAX_LENGTH);
}

/** Ukrainian labels mirroring `eventPresentation()` in regulatoryRadarService.ts. */
export const SERIES_EVENT_TYPE_LABELS: Record<
  SeriesRestrictionEventEventType,
  string
> = {
  temporary_ban: "Тимчасова заборона",
  permanent_ban: "Постійна заборона",
  restore_temporary: "Поновлення після тимчасової заборони",
  restore_permanent: "Поновлення після постійної заборони",
  partial_cancellation: "Часткове скасування",
  supplement: "Доповнення до розпорядження",
};

export type SeriesOverviewTone = "blocked" | "caution" | "clear";

export interface SeriesOverviewPresentation {
  label: string;
  detail: string;
  tone: SeriesOverviewTone;
}

const NAMED_SERIES_PREVIEW_LIMIT = 6;

/**
 * Turns the passive per-registration summary (`ProductCard.seriesStatus`)
 * into pharmacist-facing text. Unlike the earlier version, this surfaces the
 * distinctions the summary already carries — all-series bans, the specific
 * series names already on file, and the "series not stated" edge case —
 * instead of a single generic "check the batch" sentence.
 */
export function seriesOverviewPresentation(
  series: ProductSeriesRestrictionSummary,
): SeriesOverviewPresentation {
  if (series.allSeriesAffected) {
    return {
      label: "Заборонено всі серії",
      detail: `Чинна заборона поширюється на всі серії цього реєстраційного посвідчення. Пов'язаних документів: ${series.eventCount}.`,
      tone: "blocked",
    };
  }
  if (series.requiresSeriesCheck) {
    const named = series.restrictedSeries.slice(0, NAMED_SERIES_PREVIEW_LIMIT);
    const remainder = series.restrictedSeries.length - named.length;
    const parts = [
      named.length
        ? `Названі в документах серії: ${named.join(", ")}${
            remainder > 0 ? ` та ще ${remainder}` : ""
          }.`
        : "Конкретну серію в документах не деталізовано на цьому знімку.",
      series.unspecifiedSeriesAffected
        ? "Є документ без зазначеної серії — перевірку варто зробити навіть за відсутності точного збігу нижче."
        : null,
      `Пов'язаних документів: ${series.eventCount}.`,
    ].filter((part): part is string => Boolean(part));
    return {
      label: "Є розпорядження — перевірте серію",
      detail: parts.join(" "),
      tone: "caution",
    };
  }
  return {
    label: "Заборонних документів за номером не знайдено",
    detail:
      "Це результат поточного знімка, а не окремий дозвіл на застосування чи відпуск.",
    tone: "clear",
  };
}

export function seriesCheckStatusLabel(
  status: SeriesRestrictionCheckStatus,
): string {
  switch (status) {
    case "blocked":
      return "Заборонено";
    case "restored":
      return "Поновлено або скасовано";
    case "needs_review":
      return "Потрібна ручна перевірка";
    case "no_match":
      return "Точного збігу не знайдено";
  }
}
