# Automated Drug Ingestion Pipeline

v1.5 adds a safe ingestion layer for expanding FarmAssist drug-name coverage.
It does not replace the existing review workflow or DB runtime boundary.

## Flow

```text
source discovery -> registry preview -> candidate generation -> quality report -> dry-run commit -> explicit DB commit -> admin review -> approved-only runtime
```

## Commands

```bash
pnpm knowledge:sources:discover
pnpm knowledge:registry:preview -- --file=data/imports/ukraine-registry-sample.csv
pnpm knowledge:registry:import -- --file=data/imports/ukraine-registry-sample.csv
pnpm knowledge:registry:production-report
pnpm knowledge:candidates:preview
pnpm knowledge:bulk-ingest:report
```

All commands are read-only by default. DB writes require:

```bash
DATABASE_URL=... DATABASE_SSL=true KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:candidates:commit -- --commit
DATABASE_URL=... DATABASE_SSL=true KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:registry:import -- --download --commit
```

Never paste or print `DATABASE_URL`. Use a local env/session variable.

## Supported Input

- Canonical import CSV/JSON used by existing dictionary batches.
- Ukrainian registry exports as CSV, TSV or JSON.
- Official Ukrainian State Drug Registry CSV export:
  `http://www.drlz.com.ua/ibp/zvity.nsf/all/zvit/$file/reestr.csv`.
- Official CSV snapshots are decoded as Windows-1251 when needed and parsed as
  semicolon-delimited registry exports.
- XLSX can be used by exporting it to CSV/TSV first.

## v1.6 Production Registry Import

`pnpm knowledge:registry:production-report` downloads the official registry CSV,
parses product, registration, manufacturer and INN metadata, and prints a
sanitized JSON report with snapshot hash, format, encoding and counts. It does
not write to the database.

`pnpm knowledge:registry:import -- --download` performs the same production
preview and remains a dry-run. Adding `--commit` writes reviewable dictionary
candidates plus a product/manufacturer snapshot for audit and review. The
snapshot tables are not used by runtime search; runtime lookup still reads only
approved name mappings.

## Safety Boundaries

- PostgreSQL is optional locally.
- Static fallback stays available.
- Only `approved` rows affect runtime.
- `pending`, `needs_review` and `rejected` rows remain review/audit data.
- No source may add diagnosis, dosing or treatment recommendations.
- No arbitrary shell execution is exposed through the UI or API.
