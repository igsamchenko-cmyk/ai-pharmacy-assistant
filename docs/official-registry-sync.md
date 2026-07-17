# Official DRLZ registry parity and synchronization

FarmAssist treats the live official DRLZ CSV as the source of truth. A checked-in
snapshot or curated search set may be used as comparison metadata, but never as
proof that the current official export is complete.

## Scheduled audit

`.github/workflows/official-registry-sync.yml` runs every Monday and can also be
started manually. The audit job:

1. downloads the live DRLZ CSV once;
2. records its UTC timestamp and SHA-256;
3. parses every row and builds the full product import plan;
4. compares every official product with the DB when a DB connection is supplied;
5. runs the anomaly gate and a product-only dry-run;
6. stores the exact CSV and parity report as a 90-day rollback artifact.

The scheduled event is audit-only. This is intentional while production update
authority remains separate from code review.

## Apply gate

Production apply is available only through `workflow_dispatch` with `mode=apply`,
the exact audit SHA-256 in `confirm_sha256`, and an independent
`confirm_production_apply` value that exactly matches the environment-scoped
`CONFIRM_PRODUCTION_REGISTRY_APPLY` secret. Both confirmations and the secret must
equal the SHA-256 emitted by the current audit job. The
`production-registry-sync` environment also holds `PRODUCTION_DATABASE_URL`, but
the confirmation contract does not depend on plan-specific environment protection
rules. The apply job cannot download a different file: it consumes the immutable
artifact created by its own audit job.

The workflow does not expose `PRODUCTION_DATABASE_URL` to audit mode or to steps
before the confirmation gate. A failed gate writes an explicit `false` result to
the job summary and stops before schema or registry writes. The confirmation secret
is never printed.

The product update runs in one database transaction and is additive/upsert-first. PostgreSQL MVCC keeps the previous complete active snapshot visible to search until the new snapshot passes its pre-commit exact-parity gate. Every official row is marked `current`
and linked to the source hash. Rows absent from the new export are retained and
marked `stale`; they are not deleted. Catalog search and grouping filter only the
explicit `current_status`, never ingredient mapping/review status. Registry-only
products therefore remain searchable.

Each approved apply creates an append-only `knowledge_registry_sync_runs` record
with source identity, before/after counts, anomaly result, parity status, and the
rollback artifact name. Manufacturer rows removed from a changed product are soft-marked `stale`; current manufacturer rows are upserted, never deleted.

## Anomaly policy

Apply is blocked when parsing fails, registry IDs are duplicated, a trade name is
missing, valid rows fall below 15,000, the official row count drops by more than 5%,
more than 2% of current FarmAssist rows are missing, or more than 20% change in one
run. Threshold changes require code review.

## Production update order

1. Review the audit artifact and source SHA-256.
2. Add the `production-registry-sync` GitHub environment with
   `PRODUCTION_DATABASE_URL` and `CONFIRM_PRODUCTION_REGISTRY_APPLY`; set the latter
   to the audited SHA-256 approved for this run.
3. Run `mode=apply` with that SHA-256 in both `confirm_sha256` and
   `confirm_production_apply`.
4. The workflow applies additive schema changes, performs the upsert/mark-stale
   transaction sequence, then requires exact post-apply parity and the full DB
   search performance gate.
5. Verify Dashboard parity and representative search results before merging any
   unrelated feature.

No production import is part of the pull request itself.

## Rollback

Use the prior successful sync run's `checkpoint_artifact`, verify its SHA-256, and
run the same gated apply path with that CSV and hash. Because products are retained
rather than deleted, reapplying the prior artifact restores prior fields,
manufacturer sets, and `current`/`stale` membership. A rollback still requires the
same fail-closed production confirmation contract.
