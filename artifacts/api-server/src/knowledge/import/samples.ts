/**
 * Sample import file access.
 *
 * The canonical sample files live at repo-root `data/import-samples/`. This
 * module resolves that directory by searching upward from a few candidate
 * locations (so it works whether invoked from the package dir, a bundle or a
 * test), and exposes helpers to read them. If the directory cannot be found it
 * falls back to a tiny inline sample so read-only previews never crash — matching
 * the project's "degrade, never crash" policy.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DICTIONARY_SAMPLE_CSV = "ukrainian_dictionary_sample.csv";
export const DICTIONARY_SAMPLE_JSON = "ukrainian_dictionary_sample.json";
export const INTERACTIONS_SAMPLE_CSV = "interactions_sample.csv";
export const ATC_SAMPLE_CSV = "atc_sample.csv";

/** Minimal, guaranteed-valid inline dictionary sample used as a last resort. */
const INLINE_DICTIONARY_CSV = `ingredient_id,canonical_inn,name,locale,name_type,source_id,confidence,atc_code,notes
paracetamol,Парацетамол,Парацетамол,uk,ukrainian,who-inn,verified,N02BE01,
paracetamol,Парацетамол,Paracetamol,en,english,who-inn,verified,N02BE01,
`;

function candidateDirs(): string[] {
  const cwd = process.cwd();
  let fileDir = cwd;
  try {
    fileDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    // import.meta.url unavailable (e.g. certain bundlers) — cwd candidates cover it.
  }
  return [
    resolve(cwd, "data/import-samples"),
    resolve(cwd, "../../data/import-samples"),
    resolve(cwd, "../../../data/import-samples"),
    resolve(fileDir, "../../../../data/import-samples"),
    resolve(fileDir, "../../../../../data/import-samples"),
  ];
}

let cachedDir: string | null | undefined;

/** Resolve the samples directory, or null if not found on disk. */
export function findSamplesDir(): string | null {
  if (cachedDir !== undefined) return cachedDir;
  cachedDir = candidateDirs().find((d) => existsSync(d)) ?? null;
  return cachedDir;
}

/** Read a named sample file, or null if the samples dir/file is missing. */
export function readSampleFile(fileName: string): string | null {
  const dir = findSamplesDir();
  if (!dir) return null;
  const path = resolve(dir, fileName);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/** Read the dictionary sample CSV, falling back to the inline sample. */
export function readDictionarySampleCsv(): string {
  return readSampleFile(DICTIONARY_SAMPLE_CSV) ?? INLINE_DICTIONARY_CSV;
}
