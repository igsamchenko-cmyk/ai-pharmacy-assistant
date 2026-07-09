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
pnpm knowledge:candidates:preview
pnpm knowledge:bulk-ingest:report
```

All commands are read-only by default. DB writes require:

```bash
DATABASE_URL=... DATABASE_SSL=true KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:candidates:commit -- --commit
```

Never paste or print `DATABASE_URL`. Use a local env/session variable.

## Supported Input

- Canonical import CSV/JSON used by existing dictionary batches.
- Ukrainian registry exports as CSV, TSV or JSON.
- XLSX can be used by exporting it to CSV/TSV first.

## Safety Boundaries

- PostgreSQL is optional locally.
- Static fallback stays available.
- Only `approved` rows affect runtime.
- `pending`, `needs_review` and `rejected` rows remain review/audit data.
- No source may add diagnosis, dosing or treatment recommendations.
- No arbitrary shell execution is exposed through the UI or API.

