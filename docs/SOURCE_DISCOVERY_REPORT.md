# v1.6 Source Discovery Report

FarmAssist ingestion may use only auditable, non-proprietary sources. Discovery
creates candidates, not medical advice and not automatic runtime data.

## Approved or Candidate Sources

| Source | Status | Use | URL | Runtime policy |
| --- | --- | --- | --- | --- |
| WHO INN | approved | canonical generic/INN names | https://www.who.int/teams/health-product-and-policy-standards/inn | clean high/verified rows may be approved |
| WHO ATC/DDD | approved | ATC validation/classification | https://www.whocc.no/atc_ddd_index/ | classification only |
| Ukrainian State Drug Registry | candidate | official registry import from official CSV or local export | http://www.drlz.com.ua/ibp/zvity.nsf/all/zvit/$file/reestr.csv | pending by default; trade names require review |
| NLM RxNav/RxNorm | candidate | supplementary reference candidates | https://lhncbc.nlm.nih.gov/RxNav/APIs/ | pending by default |
| openFDA drug APIs | candidate | supplementary reference candidates | https://open.fda.gov/apis/drug/ | pending by default |
| FarmAssist search-miss feedback | candidate | review candidates from beta misses | internal reports only | needs_review by default |

## Blocked Sources

Commercial pharmacy catalogs, proprietary compendia, paywalled drug databases
and scraped storefront payloads are blocked unless explicit licensing/legal
approval exists. The importer guard still rejects known proprietary source
tokens.

## Operational Decision

- Do not scrape commercial pharmacy catalogs.
- Do not import clinical claims, dosing or treatment recommendations.
- Use registry/API data only to generate dictionary candidates.
- Use the official registry CSV export for production-scale Ukrainian product
  snapshots; do not scrape the registry UI.
- Keep generated typo/search-miss rows out of runtime until admin approval.
- Keep `pending`, `needs_review` and `rejected` rows hidden from runtime.
