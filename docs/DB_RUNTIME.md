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
