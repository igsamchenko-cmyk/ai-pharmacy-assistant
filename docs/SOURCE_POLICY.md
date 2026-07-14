# Source Policy

FarmAssist knowledge ingestion accepts only auditable sources with explicit
provenance. A row without a registered source is rejected by review policy.

## Allowed

- Official public registries when data is supplied as an official/local export.
- Official Ukrainian State Drug Registry CSV export for product, registration,
  manufacturer and dictionary candidate metadata.
- Official public regulatory instruction documents linked by the Ukrainian
  State Drug Registry when the exact registration, source document, version or
  date, reproducible hash, attribution and open-data reuse basis are retained.
- Public nomenclature and classification references such as WHO INN and WHO ATC.
- Public reference APIs used as supplementary candidates, not as clinical advice.
- Project-owned search-miss feedback used only for review candidates.

## Not Allowed

- Scraping commercial pharmacy catalogs.
- Copying proprietary compendia or paywalled databases.
- Importing proprietary or protected label text without an explicit reuse
  basis, exact attribution and product-registration binding.
- Inventing clinical claims, indications, dosing or treatment guidance.
- Committing secrets, API keys, tokens, raw env values or database URLs.

## Review Policy

- Clean high/verified generic rows may become `approved`.
- Medium-confidence rows become `pending`.
- Typo, search-miss, low-confidence or conflicting rows become `needs_review`.
- Unknown-source rows become `rejected`.
- Proprietary/copyright rows are blocked before commit.
- Official registry trade names and product snapshots remain review/audit data
  until an admin approves a runtime mapping.
- Official registry product rows may be imported into snapshot tables even when
  mapping candidates are ambiguous.
- Combination products are never auto-mapped to one ingredient.
- Salt, hydrate, ester, complex or derivative ambiguity becomes `needs_review`
  or quarantined until a reviewer resolves the base ingredient relationship.
- Hard conflicts block only approved/runtime-visible mapping commits. Review-only
  and quarantined conflicts must stay visible in reports.
