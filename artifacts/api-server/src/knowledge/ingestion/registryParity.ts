import { createHash } from "node:crypto";
import { normalize } from "../../lib/text";
import type { RegistryParseResult, RegistryRawRow } from "./registry";

export type RegistryEffectiveStatus = "active" | "expired" | "other";

export interface RegistryComparableProduct {
  registryId: string;
  tradeName: string;
  normalizedTradeName: string;
  inn: string;
  activeIngredient: string;
  atcCode: string;
  form: string;
  strength: string;
  applicantName: string;
  applicantCountry: string;
  manufacturers: { name: string; country: string }[];
  registrationNumber: string;
  registrationStartDate: string;
  registrationEndDate: string;
  status: string;
  earlyTermination: string;
  instructionUrl: string;
  currentStatus: "current" | "stale";
  sourceSnapshotHash: string | null;
  importBatchId: string | null;
}

export interface RegistryOfficialAudit {
  source: {
    sourceUrl: string | null;
    downloadedAt: string | null;
    contentLength: number | null;
    sha256: string | null;
    encoding: string;
    format: string;
    fileName: string | null;
  };
  asOf: string;
  rows: {
    raw: number;
    parsed: number;
    valid: number;
    invalid: number;
    withoutTradeName: number;
  };
  names: {
    uniqueRawTradeNames: number;
    uniqueNormalizedTradeNames: number;
  };
  registrations: {
    uniqueNumbers: number;
    duplicateRows: number;
    duplicateGroups: number;
  };
  productIds: {
    unique: number;
    duplicateRows: number;
    duplicateGroups: number;
  };
  statuses: Record<RegistryEffectiveStatus, number> & {
    sourceFieldAvailable: boolean;
    derivation: string;
  };
  identitySha256: string;
  failures: string[];
}

export interface RegistryFieldChanges {
  tradeNames: number;
  registrations: number;
  forms: number;
  strengths: number;
  manufacturers: number;
  ingredients: number;
  applicants: number;
  datesOrStatus: number;
  instructions: number;
  any: number;
}

export interface RegistryParityComparison {
  databaseCompared: boolean;
  farmAssistRows: number | null;
  farmAssistCurrentRows: number | null;
  farmAssistStaleRows: number | null;
  missingOfficialRows: number | null;
  missingOfficialActiveRows: number | null;
  missingOfficialTradeNames: number | null;
  extraFarmAssistRows: number | null;
  unintendedStaleRowsShownCurrent: number | null;
  officialRowsIncorrectlyMarkedStale: number | null;
  silentlyExcludedUnmappedRows: number;
  changed: RegistryFieldChanges | null;
  samples: {
    missingRegistryIds: string[];
    extraRegistryIds: string[];
    changedRegistryIds: string[];
    hiddenRegistryIds: string[];
  };
  exactParity: boolean | null;
  limitations: string[];
}

const NO_VALUES = new Set(["", "ні", "no", "false", "0"]);

function parseRegistryDate(value: string): Date | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(`${year}-${month}-${day}T23:59:59.999Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function registryEffectiveStatus(
  row: Pick<
    RegistryRawRow,
    "status" | "earlyTermination" | "registrationEndDate"
  >,
  asOf: Date,
): RegistryEffectiveStatus {
  const explicit = normalize(row.status);
  const termination = normalize(row.earlyTermination);
  if (
    (explicit &&
      !NO_VALUES.has(explicit) &&
      /(expired|withdrawn|анул|закінч|припинен)/.test(explicit)) ||
    (termination && !NO_VALUES.has(termination))
  ) {
    return "expired";
  }

  const end = normalize(row.registrationEndDate);
  if (end.includes("необмеж")) return "active";
  const endDate = parseRegistryDate(row.registrationEndDate);
  if (endDate) return endDate.getTime() < asOf.getTime() ? "expired" : "active";
  return explicit && /(active|діюч|чинн)/.test(explicit) ? "active" : "other";
}

function duplicateStats(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const duplicateGroups = [...counts.values()].filter((count) => count > 1);
  return {
    unique: counts.size,
    duplicateRows: duplicateGroups.reduce((sum, count) => sum + count - 1, 0),
    duplicateGroups: duplicateGroups.length,
  };
}

function canonicalManufacturers(
  manufacturers: readonly { name: string; country: string }[],
): string[] {
  const unique = new Map<string, { name: string; country: string }>();
  for (const item of manufacturers) {
    const name = item.name.trim();
    const country = item.country.trim();
    if (!name) continue;
    unique.set(`${normalize(name)}\u0000${country}`, { name, country });
  }
  return [...unique.values()]
    .map((item) => `${item.name}\u001f${item.country}`)
    .sort((a, b) => a.localeCompare(b));
}

export function registryComparableFromOfficial(
  row: RegistryRawRow,
  sourceSnapshotHash: string | null = null,
): RegistryComparableProduct {
  return {
    registryId: row.registryId,
    tradeName: row.tradeName,
    normalizedTradeName: normalize(row.tradeName),
    inn: row.inn,
    activeIngredient: row.activeIngredient,
    atcCode: row.atcCode,
    form: row.form,
    strength: row.strength,
    applicantName: row.applicantName,
    applicantCountry: row.applicantCountry,
    manufacturers: [...row.manufacturers],
    registrationNumber: row.registrationNumber,
    registrationStartDate: row.registrationStartDate,
    registrationEndDate: row.registrationEndDate,
    status: row.status,
    earlyTermination: row.earlyTermination,
    instructionUrl: row.instructionUrl,
    currentStatus: "current",
    sourceSnapshotHash,
    importBatchId: null,
  };
}

export function registryFullRowHash(
  row: RegistryComparableProduct | RegistryRawRow,
): string {
  const comparable =
    "normalizedTradeName" in row ? row : registryComparableFromOfficial(row);
  return createHash("sha256")
    .update(
      [
        comparable.registryId,
        comparable.tradeName,
        comparable.normalizedTradeName,
        comparable.inn,
        comparable.activeIngredient,
        comparable.atcCode,
        comparable.form,
        comparable.strength,
        comparable.applicantName,
        comparable.applicantCountry,
        canonicalManufacturers(comparable.manufacturers).join("\u001e"),
        comparable.registrationNumber,
        comparable.registrationStartDate,
        comparable.registrationEndDate,
        comparable.status,
        comparable.earlyTermination,
        comparable.instructionUrl,
      ].join("\u001f"),
    )
    .digest("hex");
}

export function buildOfficialRegistryAudit(
  registry: RegistryParseResult,
  asOf: Date = new Date(),
): RegistryOfficialAudit {
  const validRows = registry.rows.filter((row) =>
    Boolean(row.registryId && row.tradeName && row.registrationNumber),
  );
  const tradeNames = registry.rows
    .map((row) => row.tradeName.trim())
    .filter(Boolean);
  const registrations = registry.rows
    .map((row) => normalize(row.registrationNumber))
    .filter(Boolean);
  const productIds = registry.rows
    .map((row) => row.registryId.trim())
    .filter(Boolean);
  const registrationDuplicates = duplicateStats(registrations);
  const productDuplicates = duplicateStats(productIds);
  const statuses = registry.rows.reduce<
    Record<RegistryEffectiveStatus, number>
  >(
    (counts, row) => {
      counts[registryEffectiveStatus(row, asOf)]++;
      return counts;
    },
    { active: 0, expired: 0, other: 0 },
  );
  const identitySha256 = createHash("sha256")
    .update(
      registry.rows
        .map((row) => `${row.registryId}\u001f${registryFullRowHash(row)}`)
        .sort((a, b) => a.localeCompare(b))
        .join("\n"),
    )
    .digest("hex");
  const failures = [
    ...(registry.parseErrors.length > 0 ? ["parse_errors"] : []),
    ...(registry.rawRows !== registry.parsedRows
      ? ["raw_parsed_mismatch"]
      : []),
    ...(validRows.length !== registry.rows.length ? ["invalid_rows"] : []),
    ...(tradeNames.length !== registry.rows.length
      ? ["missing_trade_names"]
      : []),
    ...(productDuplicates.duplicateRows > 0 ? ["duplicate_registry_ids"] : []),
  ];

  return {
    source: {
      sourceUrl: registry.snapshot?.sourceUrl ?? null,
      downloadedAt: registry.snapshot?.downloadedAt ?? null,
      contentLength: registry.snapshot?.contentLength ?? null,
      sha256: registry.snapshot?.sha256 ?? null,
      encoding: registry.snapshot?.encoding ?? "unknown",
      format: registry.snapshot?.format ?? "unknown",
      fileName: registry.snapshot?.fileName ?? registry.fileName,
    },
    asOf: asOf.toISOString(),
    rows: {
      raw: registry.rawRows,
      parsed: registry.parsedRows,
      valid: validRows.length,
      invalid: registry.rows.length - validRows.length,
      withoutTradeName: registry.rows.length - tradeNames.length,
    },
    names: {
      uniqueRawTradeNames: new Set(tradeNames).size,
      uniqueNormalizedTradeNames: new Set(tradeNames.map(normalize)).size,
    },
    registrations: {
      uniqueNumbers: registrationDuplicates.unique,
      duplicateRows: registrationDuplicates.duplicateRows,
      duplicateGroups: registrationDuplicates.duplicateGroups,
    },
    productIds: {
      unique: productDuplicates.unique,
      duplicateRows: productDuplicates.duplicateRows,
      duplicateGroups: productDuplicates.duplicateGroups,
    },
    statuses: {
      ...statuses,
      sourceFieldAvailable: registry.rows.some((row) => Boolean(row.status)),
      derivation:
        "The official export has no populated status column; active/expired/other is derived from early termination and registration end date.",
    },
    identitySha256,
    failures,
  };
}

function changedFields(
  official: RegistryComparableProduct,
  farmAssist: RegistryComparableProduct,
): (keyof RegistryFieldChanges)[] {
  const changed: (keyof RegistryFieldChanges)[] = [];
  if (official.tradeName !== farmAssist.tradeName) changed.push("tradeNames");
  if (official.registrationNumber !== farmAssist.registrationNumber) {
    changed.push("registrations");
  }
  if (official.form !== farmAssist.form) changed.push("forms");
  if (official.strength !== farmAssist.strength) changed.push("strengths");
  if (
    canonicalManufacturers(official.manufacturers).join("\u001e") !==
    canonicalManufacturers(farmAssist.manufacturers).join("\u001e")
  ) {
    changed.push("manufacturers");
  }
  if (
    official.inn !== farmAssist.inn ||
    official.activeIngredient !== farmAssist.activeIngredient ||
    official.atcCode !== farmAssist.atcCode
  ) {
    changed.push("ingredients");
  }
  if (
    official.applicantName !== farmAssist.applicantName ||
    official.applicantCountry !== farmAssist.applicantCountry
  ) {
    changed.push("applicants");
  }
  if (
    official.registrationStartDate !== farmAssist.registrationStartDate ||
    official.registrationEndDate !== farmAssist.registrationEndDate ||
    official.status !== farmAssist.status ||
    official.earlyTermination !== farmAssist.earlyTermination
  ) {
    changed.push("datesOrStatus");
  }
  if (official.instructionUrl !== farmAssist.instructionUrl) {
    changed.push("instructions");
  }
  return changed;
}

export function compareRegistryParity(
  registry: RegistryParseResult,
  databaseRows: readonly RegistryComparableProduct[] | null,
  asOf: Date = new Date(),
): RegistryParityComparison {
  if (!databaseRows) {
    return {
      databaseCompared: false,
      farmAssistRows: null,
      farmAssistCurrentRows: null,
      farmAssistStaleRows: null,
      missingOfficialRows: null,
      missingOfficialActiveRows: null,
      missingOfficialTradeNames: null,
      extraFarmAssistRows: null,
      unintendedStaleRowsShownCurrent: null,
      officialRowsIncorrectlyMarkedStale: null,
      silentlyExcludedUnmappedRows: 0,
      changed: null,
      samples: {
        missingRegistryIds: [],
        extraRegistryIds: [],
        changedRegistryIds: [],
        hiddenRegistryIds: [],
      },
      exactParity: null,
      limitations: [
        "DATABASE_URL is not configured; production row-level parity was not queried.",
      ],
    };
  }

  const sourceHash = registry.snapshot?.sha256 ?? null;
  const officialRows = registry.rows.map((row) =>
    registryComparableFromOfficial(row, sourceHash),
  );
  const officialById = new Map(
    officialRows.map((row) => [row.registryId, row]),
  );
  const sourceById = new Map(
    registry.rows.map((row) => [row.registryId, row] as const),
  );
  const databaseById = new Map(
    databaseRows.map((row) => [row.registryId, row]),
  );
  const missing = officialRows.filter(
    (row) => !databaseById.has(row.registryId),
  );
  const extra = databaseRows.filter((row) => !officialById.has(row.registryId));
  const hidden = officialRows.filter(
    (row) => databaseById.get(row.registryId)?.currentStatus === "stale",
  );
  const officialCurrentTradeNames = new Set(
    databaseRows
      .filter((row) => row.currentStatus === "current")
      .map((row) => row.tradeName),
  );
  const missingTradeNames = new Set(
    officialRows
      .map((row) => row.tradeName)
      .filter((name) => !officialCurrentTradeNames.has(name)),
  );
  const changes: RegistryFieldChanges = {
    tradeNames: 0,
    registrations: 0,
    forms: 0,
    strengths: 0,
    manufacturers: 0,
    ingredients: 0,
    applicants: 0,
    datesOrStatus: 0,
    instructions: 0,
    any: 0,
  };
  const changedIds: string[] = [];
  for (const official of officialRows) {
    const current = databaseById.get(official.registryId);
    if (!current) continue;
    const fields = changedFields(official, current);
    if (fields.length === 0) continue;
    changes.any++;
    changedIds.push(official.registryId);
    for (const field of fields) changes[field]++;
  }
  const missingActive = missing.filter((row) => {
    const sourceRow = sourceById.get(row.registryId);
    return sourceRow && registryEffectiveStatus(sourceRow, asOf) === "active";
  });
  const unintendedStaleShown = extra.filter(
    (row) => row.currentStatus === "current",
  );
  const exactParity =
    missingActive.length === 0 &&
    missingTradeNames.size === 0 &&
    unintendedStaleShown.length === 0 &&
    hidden.length === 0 &&
    changes.any === 0;

  return {
    databaseCompared: true,
    farmAssistRows: databaseRows.length,
    farmAssistCurrentRows: databaseRows.filter(
      (row) => row.currentStatus === "current",
    ).length,
    farmAssistStaleRows: databaseRows.filter(
      (row) => row.currentStatus === "stale",
    ).length,
    missingOfficialRows: missing.length,
    missingOfficialActiveRows: missingActive.length,
    missingOfficialTradeNames: missingTradeNames.size,
    extraFarmAssistRows: extra.length,
    unintendedStaleRowsShownCurrent: unintendedStaleShown.length,
    officialRowsIncorrectlyMarkedStale: hidden.length,
    silentlyExcludedUnmappedRows: 0,
    changed: changes,
    samples: {
      missingRegistryIds: missing.slice(0, 20).map((row) => row.registryId),
      extraRegistryIds: extra.slice(0, 20).map((row) => row.registryId),
      changedRegistryIds: changedIds.slice(0, 20),
      hiddenRegistryIds: hidden.slice(0, 20).map((row) => row.registryId),
    },
    exactParity,
    limitations: [],
  };
}

export function registryAnomalyFailures(
  audit: RegistryOfficialAudit,
  comparison: RegistryParityComparison,
  previousOfficialRows = 0,
): string[] {
  const failures = [...audit.failures];
  if (audit.rows.valid < 15_000) failures.push("official_row_floor");
  if (
    previousOfficialRows > 0 &&
    audit.rows.valid < Math.floor(previousOfficialRows * 0.95)
  ) {
    failures.push("official_row_drop_over_5_percent");
  }
  if (
    comparison.databaseCompared &&
    comparison.farmAssistCurrentRows &&
    (comparison.missingOfficialRows ?? 0) >
      Math.ceil(comparison.farmAssistCurrentRows * 0.02)
  ) {
    failures.push("missing_rows_over_2_percent");
  }
  if (
    comparison.databaseCompared &&
    comparison.farmAssistCurrentRows &&
    (comparison.changed?.any ?? 0) >
      Math.ceil(comparison.farmAssistCurrentRows * 0.2)
  ) {
    failures.push("changed_rows_over_20_percent");
  }
  return [...new Set(failures)];
}
