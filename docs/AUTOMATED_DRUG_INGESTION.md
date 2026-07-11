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
DATABASE_URL=... DATABASE_SSL=true KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:registry:import -- --download --products-only --commit --require-db
DATABASE_URL=... DATABASE_SSL=true KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:registry:import -- --download --mappings-only --only-approved-mappings --commit --require-db
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
preview and remains a dry-run. Product snapshots and runtime mappings are
separate safety layers: the snapshot can retain all valid structured registry
rows for audit/review, while runtime mappings are committed only from the
approved-safe subset.

Production modes:

```bash
pnpm knowledge:registry:preview -- --download
pnpm knowledge:registry:import -- --download --products-only
pnpm knowledge:registry:production-report
pnpm knowledge:registry:import -- --download --mappings-only --only-approved
DATABASE_URL=... DATABASE_SSL=true KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:registry:import -- --download --products-only --commit --require-db
DATABASE_URL=... DATABASE_SSL=true KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:registry:import -- --download --mappings-only --only-approved-mappings --commit --require-db
```

`--force` is not supported for registry imports. Ambiguous products, same-name
conflicts, combinations and salt/base ambiguity are reported as review-only or
quarantined conflicts, not silently promoted to runtime mappings. The snapshot
tables are not used by runtime search; runtime lookup still reads only approved
name mappings.

The products-only commit uses chunked bulk writes and reports product snapshot
counts separately from mapping counts. A planned products-only commit fails if
no product rows are inserted, updated or detected as unchanged. Run the mapping
commit only after product snapshot counts are verified.

The approved-only mapping commit now deduplicates the safe plan before opening
DB transactions and writes at most 250 unique normalized mappings per short
transaction by default. It bulk-loads existing natural keys, bulk-creates
ingredients, bulk-inserts mappings and reports actual persisted/unchanged
counts. Statement, lock and stage timeouts fail visibly and the owned DB pool is
closed on success or failure. A planned mapping commit cannot report success
with zero persisted or unchanged rows.

Use the isolated database gate before any production retry:

```bash
pnpm knowledge:registry:mapping-db-smoke -- --download --limit=10 --rerun --verify-timeouts
pnpm knowledge:registry:mapping-db-smoke -- --download --limit=100 --rerun
pnpm knowledge:registry:mapping-db-smoke -- --download --limit=500 --rerun
pnpm knowledge:registry:mapping-db-smoke -- --download --expect-min-mappings=1218 --rerun
```

## Safety Boundaries

- PostgreSQL is optional locally.
- Static fallback stays available.
- Only `approved` rows affect runtime.
- `pending`, `needs_review` and `rejected` rows remain review/audit data.
- No source may add diagnosis, dosing or treatment recommendations.
- No arbitrary shell execution is exposed through the UI or API.
