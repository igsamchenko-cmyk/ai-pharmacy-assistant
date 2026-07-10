export type IngestionSourceStatus =
  | "approved"
  | "candidate"
  | "blocked";

export type IngestionSourceUse =
  | "registry_import"
  | "nomenclature"
  | "classification"
  | "external_reference"
  | "project_feedback"
  | "prohibited";

export interface IngestionSource {
  key: string;
  label: string;
  status: IngestionSourceStatus;
  use: IngestionSourceUse;
  url: string | null;
  supportedFormats: string[];
  provenanceSourceId: string | null;
  defaultReviewPolicy: "approved_if_clean" | "pending" | "needs_review" | "rejected";
  notes: string[];
}

export interface SourceDiscoveryReport {
  version: "1.6-source-discovery";
  generatedAt: string;
  approvedSources: number;
  candidateSources: number;
  blockedSources: number;
  sources: IngestionSource[];
  policy: {
    commercialCatalogScrapingAllowed: false;
    clinicalAdviceAllowed: false;
    runtimeRequiresApprovedRows: true;
    rawSecretsIncluded: false;
  };
}

export const INGESTION_SOURCES: readonly IngestionSource[] = [
  {
    key: "ukraine_state_drug_registry",
    label: "State Register of Medicinal Products of Ukraine",
    status: "candidate",
    use: "registry_import",
    url: "http://www.drlz.com.ua/ibp/zvity.nsf/all/zvit/$file/reestr.csv",
    supportedFormats: ["official-csv-windows-1251", "csv", "tsv", "json"],
    provenanceSourceId: "ukraine_state_drug_registry",
    defaultReviewPolicy: "pending",
    notes: [
      "Use the official CSV export or a locally provided CSV/TSV/JSON copy.",
      "Trade-name rows are review candidates and are not auto-approved.",
      "The importer does not scrape the registry web UI.",
    ],
  },
  {
    key: "who_inn",
    label: "WHO International Nonproprietary Names",
    status: "approved",
    use: "nomenclature",
    url: "https://www.who.int/teams/health-product-and-policy-standards/inn",
    supportedFormats: ["manual-curation", "public-list-reference"],
    provenanceSourceId: "who-inn",
    defaultReviewPolicy: "approved_if_clean",
    notes: [
      "Use for canonical generic/INN naming and source attribution.",
      "Do not infer dosing, indications or treatment advice from nomenclature.",
    ],
  },
  {
    key: "who_atc",
    label: "WHO ATC/DDD Index",
    status: "approved",
    use: "classification",
    url: "https://www.whocc.no/atc_ddd_index/",
    supportedFormats: ["manual-curation", "public-classification-reference"],
    provenanceSourceId: "who-atc",
    defaultReviewPolicy: "approved_if_clean",
    notes: [
      "Use only to validate/classify ATC codes.",
      "ATC class alone is not a treatment recommendation.",
    ],
  },
  {
    key: "rxnav_rxnorm",
    label: "NLM RxNav / RxNorm APIs",
    status: "candidate",
    use: "external_reference",
    url: "https://lhncbc.nlm.nih.gov/RxNav/APIs/",
    supportedFormats: ["api-reference", "manual-review-candidates"],
    provenanceSourceId: "rxnorm_reference",
    defaultReviewPolicy: "pending",
    notes: [
      "Use as supplementary English generic/reference mapping candidates.",
      "Rows imported from API results require review unless already curated.",
    ],
  },
  {
    key: "openfda_drug",
    label: "openFDA Drug APIs",
    status: "candidate",
    use: "external_reference",
    url: "https://open.fda.gov/apis/drug/",
    supportedFormats: ["api-reference", "manual-review-candidates"],
    provenanceSourceId: "openfda",
    defaultReviewPolicy: "pending",
    notes: [
      "Use as supplementary reference metadata only.",
      "Do not import label text as clinical advice.",
    ],
  },
  {
    key: "project_search_misses",
    label: "FarmAssist search-miss feedback and beta reports",
    status: "candidate",
    use: "project_feedback",
    url: null,
    supportedFormats: ["json-report", "manual-review-candidates"],
    provenanceSourceId: "project_search_miss_feedback",
    defaultReviewPolicy: "needs_review",
    notes: [
      "Use for candidate discovery only.",
      "Miss-derived and typo rows stay pending/needs_review until an admin approves them.",
    ],
  },
  {
    key: "commercial_pharmacy_catalogs",
    label: "Commercial pharmacy catalogs and proprietary compendia",
    status: "blocked",
    use: "prohibited",
    url: null,
    supportedFormats: [],
    provenanceSourceId: null,
    defaultReviewPolicy: "rejected",
    notes: [
      "Do not scrape or import proprietary pharmacy catalog payloads.",
      "Requires explicit licensing/legal approval before any future use.",
    ],
  },
];

export function discoverIngestionSources(
  now = new Date(),
): SourceDiscoveryReport {
  const approvedSources = INGESTION_SOURCES.filter(
    (source) => source.status === "approved",
  ).length;
  const candidateSources = INGESTION_SOURCES.filter(
    (source) => source.status === "candidate",
  ).length;
  const blockedSources = INGESTION_SOURCES.filter(
    (source) => source.status === "blocked",
  ).length;

  return {
    version: "1.6-source-discovery",
    generatedAt: now.toISOString(),
    approvedSources,
    candidateSources,
    blockedSources,
    sources: [...INGESTION_SOURCES],
    policy: {
      commercialCatalogScrapingAllowed: false,
      clinicalAdviceAllowed: false,
      runtimeRequiresApprovedRows: true,
      rawSecretsIncluded: false,
    },
  };
}
