# Production Registry Import

v1.6 imports the official Ukrainian State Drug Registry as structured audit
data first, and as runtime search mappings only after a separate safety gate.

## Source

- URL: `http://www.drlz.com.ua/ibp/zvity.nsf/all/zvit/$file/reestr.csv`
- Format: semicolon-delimited CSV
- Encoding: Windows-1251 when the snapshot is not valid UTF-8
- Content retained: product, registration, manufacturer, INN, ATC and source
  metadata
- Content not retained: copied instructions, proprietary catalog text, dosing
  guidance, treatment claims or free-form clinical advice

## Snapshot vs Mapping

Product snapshot rows are audit/review records. They can be imported even when
a product name, active ingredient expression, salt, derivative or combination
is ambiguous.

Runtime mappings are separate `name -> ingredient` candidates. Only the
approved-safe subset can be committed as mappings. `pending`, `needs_review`
and quarantined rows remain hidden from runtime lookup.

This means 16,533 valid registry products do not become 16,533 approved
runtime mappings. A large review queue is expected.

## Import Modes

```bash
pnpm knowledge:registry:preview -- --download
pnpm knowledge:registry:import -- --download --products-only
pnpm knowledge:registry:production-report
pnpm knowledge:registry:import -- --download --mappings-only --only-approved
```

Defaults are dry-run and DB-free. Mapping commits require
`--only-approved` or `--only-approved-mappings`; `--force` is not supported for
registry imports.

Production DB writes are intentionally split:

```bash
pnpm db:push
pnpm knowledge:registry:import -- --download --products-only
pnpm knowledge:registry:import -- --download --products-only --commit --require-db
pnpm knowledge:runtime:verify -- --strict
pnpm knowledge:registry:import -- --download --mappings-only --only-approved-mappings
pnpm knowledge:registry:import -- --download --mappings-only --only-approved-mappings --commit --require-db
```

Run the products-only snapshot commit first. Run the approved mapping commit
only after the product snapshot reports non-zero persisted or unchanged product
rows and final DB counts.

## Products-Only Snapshot Persistence

The product snapshot commit writes structured product and manufacturer rows in
bounded bulk chunks. Configure chunk size only when needed:

```bash
REGISTRY_PRODUCT_IMPORT_CHUNK_SIZE=500
REGISTRY_PRODUCT_IMPORT_STATEMENT_TIMEOUT_MS=120000
```

Reports include sanitized counts only: planned, attempted, inserted, updated,
unchanged, skipped, failed, chunks, final product/manufacturer/registration
counts and elapsed time. They never print database URLs, credentials, raw env
values or filesystem paths.

If a products-only commit has valid planned rows but
`inserted + updated + unchanged = 0`, the command fails with:

```text
Products-only commit completed with zero persisted rows.
```

This protects production from a silent "success" while snapshot tables remain
empty.

## Approved-Only Mapping Persistence

The mapping commit prepares, validates, normalizes and deduplicates the complete
approved-safe plan before opening a write transaction. The default mapping
batch size is 250 unique normalized names. Each batch uses one short transaction
with bulk existing-key lookup, bulk ingredient insertion and bulk mapping
insertion.

Configuration is optional:

```bash
REGISTRY_MAPPING_IMPORT_CHUNK_SIZE=250
REGISTRY_MAPPING_IMPORT_STATEMENT_TIMEOUT_MS=60000
REGISTRY_MAPPING_IMPORT_LOCK_TIMEOUT_MS=10000
REGISTRY_MAPPING_IMPORT_STAGE_TIMEOUT_MS=600000
```

The chunk size can also be set with `--mapping-chunk-size=<n>`. Progress is
written as sanitized counters with stage, chunk number, attempted, inserted,
updated, unchanged, skipped, failed, elapsed time and last completed chunk
timestamp. Reports include final total and approved mapping counts.

If approved candidates exist but `inserted + updated + unchanged = 0`, the
command exits non-zero with:

```text
Approved mappings commit completed with zero persisted rows.
```

A non-approved status, approved hard conflict or conflict with an existing
natural key fails before that row is written. Products are never touched in
`--mappings-only` mode.

The previous production attempt held one transaction open while issuing
sequential ingredient and mapping inserts for every candidate. Network
round-trips left PostgreSQL `idle in transaction` between client queries; the
process was stopped and the single transaction rolled back, so production
remained at 721 approved mappings with no partial writes. Bounded chunks,
timeouts and actual persisted counters remove that failure mode.

## Candidate Policy

Auto-approved generic mappings require a single clear INN, official provenance,
high confidence, no salt/base ambiguity, no combination marker and no hard
conflict in the approved subset.

Trade names are review candidates by default. Combination products, salt/base
ambiguity, derivative ambiguity, uncertain splits and same normalized names
pointing to multiple ingredients are `needs_review` or quarantined. They are
reported, not hidden.

## Conflict Report

Registry conflicts are grouped by normalized name, candidate type and ingredient
IDs. Reports include affected registrations and samples, without filesystem
paths, raw environment values or secrets.

`hard_conflicts` block mapping commits only when they remain in the approved
subset. Review-only and quarantined conflicts do not block product snapshot
dry-runs.

## Retry and Rollback

The import is idempotent: product snapshots use stable registry IDs or row
hashes, and mapping rows use normalized-name uniqueness. Re-running the same
snapshot is safe.

To retry safely after this fix is reviewed, merged and green in Linux CI, do not rerun products. Verify the existing product counts, run the approved-only mapping dry-run, create a fresh backup/checkpoint, then run the approved-only mapping commit once. Verify final counts and run the identical command once more for idempotency.
To roll back a bad reviewed mapping, change its review status away from
`approved`; runtime lookup only reads approved rows.

The previous products-only blocker was caused by per-row writes inside a long
transaction against an external database. When that process timed out, the
transaction rolled back, leaving zero product rows while existing approved
mappings stayed intact. Chunked bulk writes and the zero-write invariant prevent
that failure mode from looking successful.

## CI Gate

v1.6 requires a clean Node 24 Linux gate. The workflow
`.github/workflows/v16-registry-validation.yml` runs codegen, schema push
against a PostgreSQL service, products-only DB smoke, approved-only mapping DB smoke at 10/100/500/full scale, official registry dry-runs,
full knowledge validation, beta readiness, tests, build and diff checks without
production database credentials.
