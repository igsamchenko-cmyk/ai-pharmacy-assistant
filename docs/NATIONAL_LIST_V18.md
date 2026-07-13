# Versioned National Medicines List

FarmAssist uses the official consolidated text of Cabinet of Ministers
Resolution No. 333 dated 25 March 2009 as the source of truth for the National
Medicines List. The committed snapshot is based on the revision effective from
10 October 2025, introduced by Resolution No. 1268 dated 8 October 2025.

- Canonical act: https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF#Text
- Printable parser input: https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF/print
- Revision date: `2025-10-10`
- Effective date: `2025-10-10`
- Checked: `2026-07-13`
- Format: official HTML table
- Parser: `national-list-html-v2`
- Snapshot: `data/national-list/ua-2025-10-10.json`
- SHA-256: `483ce7c0319e72294762fdec7032de64271ee263dea8f3b9dc9197ffe0faaa75`
- Counts: 678 raw, 678 parsed, 678 valid, 0 invalid
- Provenance coverage: 100%

The parser pins this reviewed document hash. Any source-byte change blocks the
release until the source metadata, parser output and diff are reviewed again.

Resolution No. 687 dated 27 May 2026 is not used as the active list. The
official legislation portal marks it as pending entry into force together with
the new Law of Ukraine on Medicinal Products.

## Safety boundary

The `Нацперелік` badge is rendered only for an `exact` deterministic match.
An exact match requires the same INN or fixed combination and every applicable
form, route and strength constraint. Separate presence of combination
components is never treated as presence of the fixed combination.

Other statuses are explicit: `ingredient_only`, `uncertain`, `not_listed` and
`not_applicable`. National-list status is procurement/reference metadata. It is
not a clinical recommendation and does not imply interchangeability.

## Lifecycle

All normal commands are dry-run:

```text
pnpm knowledge:national-list:source
pnpm knowledge:national-list:dry-run
pnpm knowledge:national-list:match-report
pnpm knowledge:national-list:import -- --download
```

A non-production DB commit requires both explicit flags:

```text
pnpm knowledge:national-list:import -- --commit --require-db
```

Commit stores an immutable `reviewed` release and its entries. It does not make
the release active. Activation additionally requires `--activate` and the
release-specific `CONFIRM_NATIONAL_LIST_ACTIVATION` value. Rollback requires the
same release-specific confirmation and refuses a release without a complete
versioned resolver cache.

This pull request does not run commit, activation, rollback, or any production
database command.

## Data model and runtime

- `national_list_releases` stores version, source, hash, counts and state.
- `national_list_entries` stores structured official facts and provenance.
- `national_list_match_results` is a release-versioned deterministic cache.
- Catalog reads join one active release and its bounded cache in bulk; there is
  no per-product query.
- With no active release or no DB, existing static fallback remains available
  and products return `not_applicable`.

Linux Node 24 CI uses a disposable PostgreSQL service to verify schema push,
idempotent commit, activation/rollback, resolver-cache completeness, unchanged
registry/mapping counts, indexed query plans and warm-search regression.
