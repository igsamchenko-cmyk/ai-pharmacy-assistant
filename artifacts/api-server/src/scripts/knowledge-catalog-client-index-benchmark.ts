import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_CLIENT_INDEX_VERSION,
  catalogClientIndexWireBytes,
  catalogCompositionKey,
  compileCatalogClientIndex,
  encodeCatalogClientIndexRow,
  isNonSpecificInn,
  normalizeCatalogIndexText,
  searchCatalogClientIndex,
  type CatalogClientIndexPayload,
} from "@workspace/catalog-index";
import {
  buildCatalogClientIndexAliases,
  conciseCatalogIndexForm,
} from "../services/catalogClientIndexService";
import { normalizeRegistrationNumber } from "../knowledge/dispensingCategories/model";
import {
  priceCatalogCompositionByRegistration,
  priceCatalogStrengthByRegistration,
} from "../knowledge/priceCatalog/catalog";
import {
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
} from "../knowledge/ingestion";

const DEFAULT_REPORT_PATH = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/catalog-client-index-benchmark.json",
    import.meta.url,
  ),
);
const REPRESENTATIVE_QUERIES = [
  { query: "Енап", expectedTradePrefix: "Енап" },
  {
    query: "\u041d\u0443\u0440\u043e\u0444\u0435\u043d",
    expectedTradePrefix: "\u041d\u0423\u0420\u041e\u0424\u0404\u041d",
  },
  { query: "Еліквіс", expectedTradePrefix: "Еліквіс" },
  { query: "Амоксиклав", expectedTradePrefix: "Амоксиклав" },
  { query: "Ксарелто", expectedTradePrefix: "Ксарелто" },
  { query: "Парацетамол", expectedTradePrefix: "Парацетамол" },
  { query: "Цефтріаксон", expectedTradePrefix: "Цефтріаксон" },
  { query: "Метформін", expectedTradePrefix: "Метформін" },
  { query: "Омепразол", expectedTradePrefix: "Омепразол" },
  { query: "Амлодипін", expectedTradePrefix: "Амлодипін" },
  { query: "Форксига", expectedTradePrefix: "Форксіга" },
  { query: "Джардінс", expectedTradePrefix: "Джардінс" },
] as const;
const TRANSLITERATION_QUERIES = ["enap", "elikvis", "ksarelto"] as const;
const WARM_RUNS = 10;

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function percentile(sorted: readonly number[], value: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)] ?? 0;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"'`]+/gu, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/gu, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/giu, "[database-url]")
    : "Catalog client index benchmark failed.";
}

async function main(): Promise<void> {
  const file = argValue("--file=");
  const download = process.argv.includes("--download");
  const expectedSha256 = argValue("--expected-sha256=")?.toLowerCase() ?? "";
  if ((!file && !download) || (file && download)) {
    throw new Error(
      "Choose exactly one registry source: --file=<csv> or --download.",
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
    throw new Error("--expected-sha256=<64 lowercase hex chars> is required.");
  }

  const downloaded = download ? await downloadOfficialRegistrySnapshot() : null;
  const registry = downloaded
    ? parseRegistryText(downloaded.text, { snapshot: downloaded.metadata })
    : parseRegistryFile(file as string);
  const sourceSha256 = registry.snapshot?.sha256?.toLowerCase() ?? "";
  if (sourceSha256 !== expectedSha256) {
    throw new Error(
      "Official registry SHA-256 does not match the explicit confirmation.",
    );
  }
  if (registry.parseErrors.length || registry.rows.length !== 16_533) {
    throw new Error(
      "Benchmark requires the complete 16,533-row audited registry snapshot.",
    );
  }

  const aliases = buildCatalogClientIndexAliases();
  // Mirror the production payload: composition keys, manufacturer names and
  // validity dates all carry real wire weight.
  const compositions = priceCatalogCompositionByRegistration();
  const strengths = priceCatalogStrengthByRegistration();
  const payload: CatalogClientIndexPayload = {
    version: CATALOG_CLIENT_INDEX_VERSION,
    snapshotHash: sourceSha256,
    generatedAt: "1970-01-01T00:00:00.000Z",
    productCount: registry.rows.length,
    aliasCount: aliases.length,
    rows: registry.rows.map((row) => {
      const registration = normalizeRegistrationNumber(row.registrationNumber);
      const composition = isNonSpecificInn(row.inn)
        ? compositions.get(registration)
        : undefined;
      const endDate = /^(\d{2})\.(\d{2})\.(\d{4})/u.exec(
        row.registrationEndDate,
      );
      return encodeCatalogClientIndexRow({
        productId: row.registryId,
        registration: row.registrationNumber,
        tradeName: row.tradeName,
        inn: row.inn,
        form: conciseCatalogIndexForm(row.form),
        strength: row.strength || (strengths.get(registration) ?? ""),
        compositionKey: composition ? catalogCompositionKey(composition) : "",
        manufacturer: row.manufacturers[0]?.name ?? "",
        registrationValidity: endDate
          ? `${endDate[3]}-${endDate[2]}-${endDate[1]}`
          : row.registrationEndDate.slice(0, 10),
      });
    }),
    aliases,
  };
  const index = compileCatalogClientIndex(payload);
  const timings: number[] = [];
  const representative = REPRESENTATIVE_QUERIES.map((fixture) => {
    const { query } = fixture;
    searchCatalogClientIndex(index, query);
    let result = searchCatalogClientIndex(index, query);
    for (let run = 0; run < WARM_RUNS; run += 1) {
      result = searchCatalogClientIndex(index, query);
      timings.push(result.durationMs);
    }
    const topTradeName = result.items[0]?.product.tradeName ?? null;
    const normalizedTopTradeName = normalizeCatalogIndexText(
      topTradeName ?? "",
    );
    const normalizedQuery = normalizeCatalogIndexText(query);
    const exactTradeExists = index.products.some(
      (product) =>
        normalizeCatalogIndexText(product.tradeName) === normalizedQuery,
    );
    const expectedTradePrefix =
      "expectedTradePrefix" in fixture ? fixture.expectedTradePrefix : null;
    const expectedAlias = "expectedAlias" in fixture && fixture.expectedAlias;
    return {
      query,
      expectedTradePrefix,
      expectedAlias,
      matches: result.total,
      topTradeName,
      matchedBy: result.items[0]?.matchedBy ?? null,
      exactTradeExists,
      exactTradeFirst:
        !exactTradeExists || normalizedTopTradeName === normalizedQuery,
      serverSemanticFirst: expectedAlias
        ? result.items[0]?.matchedBy === "source_alias"
        : normalizedTopTradeName.startsWith(
            normalizeCatalogIndexText(expectedTradePrefix ?? ""),
          ),
    };
  });
  const transliteration = TRANSLITERATION_QUERIES.map((query) => {
    const result = searchCatalogClientIndex(index, query);
    return {
      query,
      matches: result.total,
      topTradeName: result.items[0]?.product.tradeName ?? null,
    };
  });
  const sortedTimings = [...timings].sort((left, right) => left - right);
  const wireBytes = catalogClientIndexWireBytes(payload);
  const report = {
    schemaVersion: "catalog-client-index-benchmark-v1",
    source: { sha256: sourceSha256, officialRows: registry.rows.length },
    coverage: {
      indexedProducts: index.productCount,
      searchableProducts: index.products.filter((product) =>
        Boolean(product.productId && product.registration),
      ).length,
      missingProducts: registry.rows.length - index.productCount,
    },
    bounds: {
      wireBytes,
      estimatedMemoryBytes: index.estimatedMemoryBytes,
      wireBudgetBytes: 8 * 1024 * 1024,
      memoryBudgetBytes: 32 * 1024 * 1024,
    },
    performance: {
      warmRunsPerQuery: WARM_RUNS,
      samples: sortedTimings.length,
      p50Ms: Number(percentile(sortedTimings, 0.5).toFixed(3)),
      p95Ms: Number(percentile(sortedTimings, 0.95).toFixed(3)),
      maxMs: Number((sortedTimings.at(-1) ?? 0).toFixed(3)),
      acceptanceP95Ms: 50,
    },
    ranking: {
      contract:
        "exact trade > trade prefix > exact INN > INN prefix > transliteration > source-backed alias",
      representative,
      representativeExactTradeFirst: representative.every(
        (item) => item.exactTradeFirst,
      ),
      representativeServerSemanticFirst: representative.every(
        (item) => item.serverSemanticFirst,
      ),
      transliteration,
    },
    offline: {
      storage: "IndexedDB",
      activation:
        "old snapshot remains active until changed payload validates and commits",
      serverFallback: true,
    },
  };
  const acceptanceFailures = [
    report.coverage.missingProducts !== 0
      ? `missing-products=${report.coverage.missingProducts}`
      : null,
    report.performance.p95Ms > report.performance.acceptanceP95Ms
      ? `p95-ms=${report.performance.p95Ms}`
      : null,
    !report.ranking.representativeExactTradeFirst
      ? `exact-trade-first=${report.ranking.representative
          .filter((item) => !item.exactTradeFirst)
          .map((item) => item.query)
          .join(",")}`
      : null,
    !report.ranking.representativeServerSemanticFirst
      ? `server-semantic-first=${report.ranking.representative
          .filter((item) => !item.serverSemanticFirst)
          .map((item) => `${item.query}->${item.topTradeName ?? "no-match"}`)
          .join(",")}`
      : null,
    wireBytes > report.bounds.wireBudgetBytes
      ? `wire-bytes=${wireBytes}`
      : null,
    index.estimatedMemoryBytes > report.bounds.memoryBudgetBytes
      ? `estimated-memory-bytes=${index.estimatedMemoryBytes}`
      : null,
  ].filter((failure): failure is string => Boolean(failure));
  if (acceptanceFailures.length) {
    throw new Error(
      `Catalog client index benchmark acceptance failed: ${acceptanceFailures.join("; ")}.`,
    );
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = resolve(argValue("--out=") ?? DEFAULT_REPORT_PATH);
  if (process.argv.includes("--check")) {
    if (
      readFileSync(outputPath, "utf8").replace(/\r\n/gu, "\n") !== serialized
    ) {
      throw new Error("Catalog client index benchmark report drift detected.");
    }
  } else if (process.argv.includes("--write")) {
    writeFileSync(outputPath, serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
