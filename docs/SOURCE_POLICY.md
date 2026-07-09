# Source Policy

FarmAssist knowledge ingestion accepts only auditable sources with explicit
provenance. A row without a registered source is rejected by review policy.

## Allowed

- Official public registries when data is supplied as an official/local export.
- Public nomenclature and classification references such as WHO INN and WHO ATC.
- Public reference APIs used as supplementary candidates, not as clinical advice.
- Project-owned search-miss feedback used only for review candidates.

## Not Allowed

- Scraping commercial pharmacy catalogs.
- Copying proprietary compendia or paywalled databases.
- Importing protected label text as user-facing clinical advice.
- Inventing clinical claims, indications, dosing or treatment guidance.
- Committing secrets, API keys, tokens, raw env values or database URLs.

## Review Policy

- Clean high/verified generic rows may become `approved`.
- Medium-confidence rows become `pending`.
- Typo, search-miss, low-confidence or conflicting rows become `needs_review`.
- Unknown-source rows become `rejected`.
- Proprietary/copyright rows are blocked before commit.

