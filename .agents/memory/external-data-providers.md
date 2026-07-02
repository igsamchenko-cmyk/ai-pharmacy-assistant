---
name: External drug data providers
description: RxNorm + openFDA integration behavior, caching, and their data limits.
---

# External drug data providers

`services/providers/rxnorm.ts` (public rxnav.nlm.nih.gov, no key) and
`services/providers/openfda.ts` (api.fda.gov, optional `OPENFDA_API_KEY` for
higher limits) supply supplementary data, aggregated by
`services/externalDataService.ts` and served at `GET /external/drug` and
`GET /sources`.

Contract rules:
- Every provider degrades to `null` on any error/timeout (AbortController) and
  NEVER throws to the caller — the demo catalog stays the source of truth.
- Results are cached in an in-memory TTL cache (`lib/cache.ts`, `TtlCache`)
  with `getOrSet` that dedupes concurrent loads and never caches rejections.
- openFDA search terms are embedded in a quoted Lucene phrase — escape `\` and
  `"` (`escapeLucenePhrase`) before interpolating user input.

**Key limitation:** RxNorm and openFDA are English/US databases. The demo
catalog's INN/brand names are Ukrainian, so lookups by Ukrainian name match
poorly or not at all (expect noisy/empty results). Treat external data as
best-effort supplementary reference, not authoritative — and prefer Latin-script
INN when adding real enrichment.
