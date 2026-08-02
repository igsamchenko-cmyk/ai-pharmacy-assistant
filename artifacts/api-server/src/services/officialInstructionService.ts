import type { DrugInstructionSnapshot } from "../knowledge/instructions/model";
import {
  getInstructionForProduct,
  loadInstructionSources,
} from "../knowledge/instructions/catalog";
import {
  parseOfficialInstructionMht,
  type ParseInstructionOptions,
  withAdministrationFacts,
} from "../knowledge/instructions/parser";
import { InstructionSourceProductSchema } from "../knowledge/instructions/model";
import { hasStructuredOfficialInstructionSource } from "../knowledge/instructions/source";
export {
  hasStructuredOfficialInstructionSource as hasOfficialInstructionSource,
  resolveOfficialInstructionSource,
  type OfficialInstructionSourceResolution,
  type OfficialInstructionSourceStatus,
} from "../knowledge/instructions/source";
import { isDbRuntimeEnabled } from "../knowledge/runtime";
import { TtlCache } from "../lib/cache";

const MAX_DOCUMENT_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const SUCCESS_CACHE_TTL_MS = 6 * 60 * 60_000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60_000;

export interface OfficialInstructionQueryExecutor {
  query(text: string, values?: unknown[]): PromiseLike<{ rows: unknown[] }>;
}

interface RegistryInstructionRow {
  registry_id: string;
  registration_number: string;
  trade_name: string;
  inn: string;
  active_ingredient: string;
  form: string;
  strength: string;
  applicant_name: string;
  applicant_country: string;
  registration_start_date: string;
  registration_end_date: string;
  instruction_url: string | null;
  manufacturer_name: string | null;
  manufacturer_country: string | null;
}

export interface OfficialInstructionLoaderOptions {
  executor?: OfficialInstructionQueryExecutor;
  fetcher?: typeof fetch;
  parser?: (
    raw: Buffer,
    options: ParseInstructionOptions,
  ) => DrugInstructionSnapshot;
}

const dynamicInstructionCache = new TtlCache<DrugInstructionSnapshot | null>({
  ttlMs: SUCCESS_CACHE_TTL_MS,
  maxEntries: 96,
});

async function executorOrDefault(
  executor?: OfficialInstructionQueryExecutor,
): Promise<OfficialInstructionQueryExecutor | null> {
  if (executor) return executor;
  if (!isDbRuntimeEnabled()) return null;
  return (await import("@workspace/db"))
    .pool as OfficialInstructionQueryExecutor;
}

async function readRegistryInstructionRow(
  registryProductId: string,
  executor: OfficialInstructionQueryExecutor,
): Promise<RegistryInstructionRow | null> {
  const result = await executor.query(
    `SELECT
       p.registry_id,
       p.registration_number,
       p.trade_name,
       p.inn,
       p.active_ingredient,
       p.form,
       p.strength,
       p.applicant_name,
       p.applicant_country,
       p.registration_start_date,
       p.registration_end_date,
       p.instruction_url,
       manufacturer.name AS manufacturer_name,
       manufacturer.country AS manufacturer_country
     FROM knowledge_registry_products p
     LEFT JOIN LATERAL (
       SELECT m.name, m.country
       FROM knowledge_registry_manufacturers m
       WHERE m.product_registry_id = p.registry_id
         AND m.current_status <> 'stale'
       ORDER BY m.normalized_name, m.country
       LIMIT 1
     ) manufacturer ON TRUE
     WHERE p.registry_id = $1
       AND p.review_status <> 'stale'
       AND p.current_status = 'current'
     LIMIT 1`,
    [registryProductId],
  );
  return (result.rows[0] as RegistryInstructionRow | undefined) ?? null;
}

function officialValue(value: string | null | undefined): string {
  return value?.trim() || "Не вказано у ДРЛЗ";
}

async function downloadOfficialInstruction(
  sourceUrl: string,
  fetcher: typeof fetch,
): Promise<{ bytes: Buffer; lastModified: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(sourceUrl, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("official_instruction_download_failed");
    }
    const announcedLength = Number(response.headers.get("content-length") ?? 0);
    if (announcedLength > MAX_DOCUMENT_BYTES) {
      throw new Error("official_instruction_document_too_large");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) {
      throw new Error("official_instruction_document_size_invalid");
    }
    return {
      bytes,
      lastModified: response.headers.get("last-modified"),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      /^official_instruction_[a-z_]+$/u.test(error.message)
    ) {
      throw error;
    }
    throw new Error("official_instruction_download_failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function loadDynamicInstruction(
  registryProductId: string,
  options: OfficialInstructionLoaderOptions,
): Promise<DrugInstructionSnapshot | null> {
  const executor = await executorOrDefault(options.executor);
  if (!executor) return null;
  const row = await readRegistryInstructionRow(registryProductId, executor);
  if (
    !row ||
    !hasStructuredOfficialInstructionSource(
      row.instruction_url,
      row.registration_number,
    )
  ) {
    return null;
  }

  const source = InstructionSourceProductSchema.parse({
    registryProductId: row.registry_id,
    registrationNumber: row.registration_number,
    tradeName: officialValue(row.trade_name),
    inn: officialValue(row.inn),
    activeIngredient: officialValue(row.active_ingredient),
    dosageForm: officialValue(row.form),
    strength: officialValue(row.strength).slice(0, 120),
    manufacturer: officialValue(row.manufacturer_name ?? row.applicant_name),
    manufacturerCountry: officialValue(
      row.manufacturer_country ?? row.applicant_country,
    ),
    registrationStartDate: officialValue(row.registration_start_date),
    registrationEndDate: officialValue(row.registration_end_date),
    sourceUrl: row.instruction_url?.trim(),
  });
  const downloaded = await downloadOfficialInstruction(
    source.sourceUrl,
    options.fetcher ?? fetch,
  );
  const dataset = loadInstructionSources().dataset;
  const parsedSnapshot = (options.parser ?? parseOfficialInstructionMht)(
    downloaded.bytes,
    {
      source,
      dataset: {
        title: dataset.title,
        url: dataset.url,
        license: dataset.license,
      },
      checkedAt: new Date(),
      lastModified: downloaded.lastModified,
    },
  );
  const snapshot = withAdministrationFacts(parsedSnapshot);
  if (
    snapshot.registryProductId !== row.registry_id ||
    snapshot.registrationNumber !== row.registration_number ||
    !snapshot.provenance.sourceAllowed ||
    !snapshot.provenance.registrationMatched ||
    !snapshot.provenance.contentLocationMatched ||
    (snapshot.status !== "available" && snapshot.status !== "partial")
  ) {
    return null;
  }
  return snapshot;
}

export async function getOfficialInstructionForProduct(
  registryProductId: string,
  options: OfficialInstructionLoaderOptions = {},
): Promise<DrugInstructionSnapshot | null> {
  const committed = getInstructionForProduct(registryProductId);
  if (committed) return committed;

  const customDependencies = Boolean(
    options.executor || options.fetcher || options.parser,
  );
  if (customDependencies) {
    return loadDynamicInstruction(registryProductId, options);
  }
  return dynamicInstructionCache.getOrSet(
    registryProductId,
    () => loadDynamicInstruction(registryProductId, options),
    (snapshot) => (snapshot ? SUCCESS_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  );
}

export function clearDynamicInstructionCache(): void {
  dynamicInstructionCache.clear();
}
