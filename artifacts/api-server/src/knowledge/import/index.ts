import type { DrugRecord } from "../../data/drugs";

/**
 * Catalog importer abstraction.
 *
 * An abstraction only — no live importer is wired up. The interface defines how
 * a future importer (CSV, national register, distributor feed) would validate
 * and normalize external rows into `DrugRecord`s. Keeping it as a contract lets
 * the catalog stay a static, testable module today while leaving a clean seam
 * for real ingestion later.
 */
export interface ImportIssue {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  imported: DrugRecord[];
  issues: ImportIssue[];
  /** True when the importer is a real, configured source (not the stub). */
  configured: boolean;
}

export interface CatalogImporter {
  readonly id: string;
  /** Parse & validate raw rows into DrugRecords, collecting issues. */
  import(rows: unknown[]): Promise<ImportResult>;
}

/** Default importer: reports "not configured", imports nothing, fabricates nothing. */
export class UnconfiguredCatalogImporter implements CatalogImporter {
  readonly id = "unconfigured";

  async import(rows: unknown[]): Promise<ImportResult> {
    return {
      imported: [],
      issues: [
        {
          row: 0,
          field: "*",
          message:
            "Імпорт каталогу ще не підключено. Каталог наразі є статичним модулем.",
        },
      ],
      configured: false,
    };
  }
}

let activeImporter: CatalogImporter = new UnconfiguredCatalogImporter();

export function setCatalogImporter(importer: CatalogImporter): void {
  activeImporter = importer;
}

export function importCatalog(rows: unknown[]): Promise<ImportResult> {
  return activeImporter.import(rows);
}

export function getCatalogImporterId(): string {
  return activeImporter.id;
}

// v0.4 dictionary import pipeline (format, parse, guard, review, analyze, samples).
export * from "./format";
export * from "./csv";
export * from "./parse";
export * from "./guard";
export * from "./review";
export * from "./analyze";
export * from "./samples";
