/**
 * Knowledge Engine — the single entry point for the Ukrainian pharmacy
 * knowledge system. It composes independent modules:
 *
 *   dictionary  — name → canonical ingredient normalization (UA/Latin/English)
 *   atc         — ATC code → anatomical / therapeutic classification
 *   search      — multi-stage lookup (cache → dictionary → catalog → external → AI)
 *   compare     — side-by-side drug comparison + pairwise interactions
 *   barcode     — GTIN resolution abstraction (pluggable, stubbed by default)
 *   import      — catalog importer abstraction (pluggable, stubbed by default)
 *
 * Everything degrades gracefully and stays free of medical advice: the engine
 * returns reference data only and never diagnoses or prescribes.
 */
export * from "./dictionary";
export * from "./atc";
export * from "./search";
export * from "./compare";
export * from "./barcode";
export * from "./import";
export * from "./import/pipeline";
export * from "./provenance";
export * from "./validation";
export * from "./runtime";
export * from "./dbRuntime";
export * from "./backfill";
export * from "./runtimeVerify";
export * from "./qualityReport";
export * from "./reviewWorkflow";
export * from "./ingestion";
export * from "./dictionary/provider";
export * from "./dictionary/active";

import { getDictionaryStats } from "./dictionary";
import { interactionRules } from "../data/interactions";
import { getBarcodeResolverId } from "./barcode";
import { getCatalogImporterId } from "./import";

export interface KnowledgeEngineStats {
  dictionary: ReturnType<typeof getDictionaryStats>;
  interactionRules: number;
  barcodeResolver: string;
  catalogImporter: string;
}

export function getKnowledgeEngineStats(): KnowledgeEngineStats {
  return {
    dictionary: getDictionaryStats(),
    interactionRules: interactionRules.length,
    barcodeResolver: getBarcodeResolverId(),
    catalogImporter: getCatalogImporterId(),
  };
}
