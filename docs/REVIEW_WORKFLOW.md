# Admin Review Workflow

v0.7 adds an admin review workflow for imported knowledge rows. The goal is to
let operators inspect imported mappings before they affect DB runtime, while
preserving the static fallback and medical-safety boundaries.

## Review statuses

- `pending` - waiting for a human decision. It is stored for audit, but ignored
  by DB runtime.
- `approved` - reviewed or auto-approved by policy. Only these rows can affect
  DB-backed normalize/search.
- `rejected` - refused by a reviewer or import policy. It remains auditable, but
  is ignored by runtime.
- `needs_review` - suspicious, conflicting, typo-like, or low-confidence data
  that requires closer review. It is ignored by runtime.

## Runtime rule

DB runtime reads `knowledge_ingredient_names` only when
`KNOWLEDGE_DB_RUNTIME=true`, and only rows with `review_status='approved'` are
user-facing. If the DB is unavailable, static runtime remains active.

## Queue data model

The review queue reuses `knowledge_ingredient_names` for reviewable imported name
mappings. Rows carry display and normalized names, mapped ingredient, source,
confidence, locale, mapping type, review status, conflict flags, validation
warnings, timestamps, reviewer, note, import batch and provenance.

Review decisions are appended to `knowledge_review_audit_log` with action,
previous status, next status, note/reason, reviewer, source and import batch.

## API

OpenAPI is the source of truth. The admin workflow exposes:

- `GET /api/knowledge/review/queue`
- `GET /api/knowledge/review/stats`
- `POST /api/knowledge/review/{id}/approve`
- `POST /api/knowledge/review/{id}/reject`
- `POST /api/knowledge/review/{id}/needs-review`

Read endpoints return an empty queue/stats with the warning
`DB review workflow is unavailable. Static runtime remains active.` when the DB
is not configured or cannot be reached.

## UI

The `/review` page shows status counts, conflict count, filters, item details,
provenance, warnings, notes and actions. The page renders without a DB and shows
the static-runtime fallback message instead of crashing.

## Import integration

Dictionary import preview already reports the review distribution. `import:knowledge
--commit` now writes non-copyright rows with their derived review status:

- clean high/verified rows can be `approved`;
- medium confidence rows become `pending`;
- low confidence, typo-like or conflicting rows become `needs_review`;
- unknown-source rows are `rejected` unless policy changes;
- copyrighted/proprietary rows are blocked and never enter the DB runtime path.

## Who should approve

Only a qualified operator with access to source evidence should approve imported
rows. Approval means the mapping is acceptable as reference data for the pharmacy
knowledge system, not that it is clinical advice.

## Verification

Recommended checks:

```bash
pnpm db:push
pnpm import:preview
DATABASE_URL=... pnpm import:knowledge -- --commit
KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify
pnpm knowledge:quality:report
pnpm -r test
```

A row is visible in DB runtime only after it is `approved`; changing it back to
`rejected` or `needs_review` hides it again.

## v0.8 Runtime Deployment Boundary

The PostgreSQL deployment profile does not change review semantics. Import commit
stores allowed non-copyright rows with derived review status. Only `approved`
rows are visible to DB runtime normalize/search. `pending`, `rejected`, and
`needs_review` rows stay available for audit/review but are hidden from runtime.
Copyrighted or proprietary rows remain blocked/dropped and must never be
approved.

`pnpm knowledge:runtime:smoke` verifies this approved-only boundary against a
real configured DB and against synthetic non-approved rows.
