# Knowledge DB Runtime

The DB runtime is optional and remains behind `KNOWLEDGE_DB_RUNTIME=true`.
Static runtime data is the default provider and remains the fallback when the DB
is disabled, unavailable, or missing.

Runtime rules:

- only `approved` DB mappings are user-facing;
- `pending`, `rejected`, and `needs_review` rows are ignored by lookup;
- DB lookup results include runtime source, confidence, score, provenance,
  review status, import batch, and import timestamp;
- DB failures return static results with warnings instead of crashing;
- no AI key is required for DB runtime verification.

Verification:

```bash
KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify
```

Without `DATABASE_URL`, verification checks the DB-shaped static snapshot and
static fallback, then exits successfully with a warning. Use `--strict` when a
live DB must be reachable.

## v0.7 Review Workflow Runtime Boundary

The DB runtime boundary is unchanged and stricter: only `approved` rows from
`knowledge_ingredient_names` are read by the DB dictionary provider. Admin review
can move rows between `pending`, `approved`, `rejected` and `needs_review`; the
runtime effect is immediate on the next lookup/cache miss because non-approved
rows are filtered out before provider creation.

`GET /knowledge/review/stats` reports approved runtime count, conflict count,
low-confidence count and latest audit activity. Without a DB, review endpoints
return safe empty data with the warning that static runtime remains active.

## v0.8 PostgreSQL Deployment Profile

The v0.8 local deployment profile adds `docker-compose.yml`, `.env.example`, and
helper scripts:

- `pnpm db:dev:up` starts local PostgreSQL with a healthcheck and persistent
  Docker volume.
- `pnpm db:dev:down` stops the local profile.
- `pnpm db:push` applies the Drizzle schema.
- `pnpm knowledge:backfill` writes static approved knowledge rows when
  `DATABASE_URL` is configured, or performs a dry-run without DB.
- `pnpm knowledge:runtime:smoke` requires `DATABASE_URL` and verifies real DB
  runtime availability, approved-row lookup/search, approved-only filtering,
  static fallback, and runtime status shape.
- `pnpm dev:db-runtime` starts the API server with DB runtime requested and does
  not print the database URL.

`/api/knowledge/runtime/status` now reports `staticRuntimeEnabled`,
`dbRuntimeRequested`, `databaseUrlConfigured`, `dbSchemaStatus`, `schemaReady`,
`fallbackReason`, approved/review counts, latest batch, source distribution and
warnings. It reports whether a URL is configured but never returns the URL.

## v0.9 Batch Import and DB Runtime

Dictionary batches are optional DB import inputs. They can be previewed without
`DATABASE_URL`; when a database is configured, operators may commit reviewed
batch files through `import:knowledge -- --commit`. The commit path stores
allowed non-copyright rows with derived review status.

Runtime invariant remains the same: DB-backed normalize/search reads only
`approved` mappings. `pending`, `rejected` and `needs_review` rows are kept
for audit/review and are not runtime-visible. Static fallback remains default and
available when DB runtime is disabled, missing or failing.

## v1.0 Closed Beta Runtime Diagnostics

Closed beta must work in static mode and may optionally test DB mode.

- Static runtime is default.
- DB runtime is requested only with `KNOWLEDGE_DB_RUNTIME=true`.
- `/api/diagnostics` reports `dbConfigured`, runtime mode, provider status, schema status, and approved mapping counts without exposing `DATABASE_URL` or server filesystem paths.
- `pnpm beta:readiness` treats absent DB as static-fallback readiness, not as a failure.

## v1.2 Auth Interaction

PostgreSQL remains optional. Auth does not require the DB: local private beta
sessions are stored in memory, while DB runtime stays behind
`KNOWLEDGE_DB_RUNTIME`. Reviewer/admin DB tools are protected by role checks.

## v1.5 Ingestion Commit Boundary

Automated ingestion commits write to the existing knowledge review tables only.
They do not bypass review status.

- `approved` rows are runtime-visible when DB runtime is enabled.
- `pending`, `needs_review` and `rejected` rows stay hidden.
- DB commit requires explicit `--commit` and `DATABASE_URL`.
- Without DB configuration, preview/report commands remain usable through static
  fallback.

## v1.6 Registry Product Snapshot Boundary

Official registry product snapshots are DB audit/review records, not runtime
lookup mappings. Products-only imports write to
`knowledge_registry_products` and `knowledge_registry_manufacturers`; they do
not write to `knowledge_ingredient_names`.

Products-only commits require `--commit --require-db`, use bounded bulk chunks,
and report final DB counts. If valid planned products exist but no products are
inserted, updated or detected as unchanged, the command fails instead of
returning a successful empty snapshot.

Approved runtime mappings remain a separate commit step and still require
`--only-approved` or `--only-approved-mappings`. Static fallback remains
available when DB runtime is disabled or unavailable.
