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
pnpm knowledge:registry:import -- --download --commit --require-db --products --only-approved-mappings
```

Defaults are dry-run and DB-free. Mapping commits require
`--only-approved` or `--only-approved-mappings`; `--force` is not supported for
registry imports.

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

To retry, rerun the dry-run command, inspect conflict groups, then rerun the
approved-only commit. To roll back a bad reviewed mapping, change its review
status away from `approved`; runtime lookup only reads approved rows.

## CI Gate

v1.6 requires a clean Node 24 Linux gate. The workflow
`.github/workflows/v16-registry-validation.yml` runs codegen, official registry
dry-runs, full knowledge validation, beta readiness, tests, build and diff
checks without production database credentials.
