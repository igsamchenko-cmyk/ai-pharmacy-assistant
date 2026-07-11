export interface RegistryImportFlags {
  commit: boolean;
  requireDb: boolean;
  productsOnly: boolean;
  mappingsOnly: boolean;
  products: boolean;
  mappings: boolean;
  onlyApprovedMappings: boolean;
  includeTradeNames: boolean;
  mappingChunkSize?: number;
}

function positiveIntArg(
  argv: readonly string[],
  prefix: string,
): number | undefined {
  const raw = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${prefix} must be a positive integer.`);
  }
  return parsed;
}

export function parseRegistryImportFlags(
  argv: readonly string[],
): RegistryImportFlags {
  if (argv.includes("--force")) {
    throw new Error(
      "Registry import does not support --force. Resolve approved blockers instead.",
    );
  }

  const commit = argv.includes("--commit");
  const requireDb = argv.includes("--require-db");
  const productsOnly = argv.includes("--products-only");
  const mappingsOnly = argv.includes("--mappings-only");
  const explicitProducts = argv.includes("--products");
  const onlyApprovedMappings =
    argv.includes("--only-approved") ||
    argv.includes("--only-approved-mappings");

  if (productsOnly && mappingsOnly) {
    throw new Error("Use either --products-only or --mappings-only, not both.");
  }
  if (explicitProducts && mappingsOnly) {
    throw new Error("Use either --products or --mappings-only, not both.");
  }

  const products =
    explicitProducts || productsOnly || (!productsOnly && !mappingsOnly);
  const mappings = mappingsOnly || !productsOnly;

  if (commit && products && mappings) {
    throw new Error(
      "Registry commits must use either --products-only or --mappings-only.",
    );
  }
  if (productsOnly && onlyApprovedMappings) {
    throw new Error(
      "Approved mapping flags cannot be combined with --products-only.",
    );
  }
  if (commit && !requireDb) {
    throw new Error("Registry commit requires --require-db.");
  }
  if (commit && mappings && !onlyApprovedMappings) {
    throw new Error(
      "Registry mapping commit requires --only-approved or --only-approved-mappings.",
    );
  }

  return {
    commit,
    requireDb,
    productsOnly,
    mappingsOnly,
    products,
    mappings,
    onlyApprovedMappings,
    includeTradeNames: !argv.includes("--no-trade-names"),
    mappingChunkSize: positiveIntArg(argv, "--mapping-chunk-size="),
  };
}
