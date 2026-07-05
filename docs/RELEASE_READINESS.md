# Release Readiness

Use this checklist before preparing the v1.0 closed beta tag.

## Commands

```bash
pnpm knowledge:import:preview:all
pnpm knowledge:import:validate:all
pnpm knowledge:backfill
pnpm knowledge:runtime:verify
pnpm knowledge:quality:report
pnpm knowledge:search:report
pnpm beta:scenarios
pnpm beta:readiness
pnpm run typecheck
pnpm -r test
PORT=5173 BASE_PATH=/ pnpm run build
```

Optional DB smoke can be run only when Docker/PostgreSQL and `DATABASE_URL` are available. Absence of Docker or DB is not a release blocker because static fallback remains supported.

## Readiness Report

Run:

```bash
pnpm beta:readiness
pnpm beta:readiness -- --write
```

The report summarizes import preview, batch validation, backfill, runtime verification, quality report, search quality, and beta scenarios. It outputs a readiness score, hard blockers, warnings, known limitations, and recommended next actions.

Generated JSON is written to `artifacts/reports/beta-readiness-report.json` and is ignored by git by default.

## Hard Blockers

- Knowledge validation errors.
- Runtime verification failure.
- Static fallback disabled.
- Expected beta search scenarios missing.
- Beta scenario validation failures.
- Safety invariant regressions.
- Diagnostics exposing secrets.

## v1.0 Tag Preparation

- Ensure `main` has the release commit.
- Confirm docs, checklist, scenario reports, and validation output have been reviewed.
- Confirm known limitations are acceptable for controlled beta use.
- Tag only after the PR is merged and CI is green.

